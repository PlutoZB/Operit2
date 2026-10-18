//! Runtime-local recycling of QuickJS's short-lived property and value blocks.
//! The runtime owns all lists; none of its addresses crosses a worker boundary.
use rquickjs::allocator::Allocator;
use std::{
    alloc::{alloc, dealloc, realloc, Layout},
    ptr,
};

const MIN_SHIFT: usize = 4;
const MAX_SHIFT: usize = 12;
const CLASSES: usize = MAX_SHIFT - MIN_SHIFT + 1;
const CACHE_BYTES_PER_CLASS: usize = 128 * 1024;
const CACHE_BYTES_TOTAL: usize = 512 * 1024;
const ALIGN: usize = 16;

#[repr(C, align(16))]
struct Header {
    capacity: usize,
}
const HEADER: usize = std::mem::size_of::<Header>();

pub(crate) struct JavaScriptAllocator {
    heads: [*mut u8; CLASSES],
    counts: [usize; CLASSES],
    cached_bytes: usize,
}
impl Default for JavaScriptAllocator {
    fn default() -> Self {
        Self {
            heads: [ptr::null_mut(); CLASSES],
            counts: [0; CLASSES],
            cached_bytes: 0,
        }
    }
}
impl JavaScriptAllocator {
    fn capacity(size: usize) -> Option<usize> {
        if size <= 1 << MAX_SHIFT {
            size.max(1 << MIN_SHIFT).checked_next_power_of_two()
        } else {
            Some(size)
        }
    }
    fn class(capacity: usize) -> Option<usize> {
        (capacity <= 1 << MAX_SHIFT).then(|| capacity.trailing_zeros() as usize - MIN_SHIFT)
    }
    fn layout(capacity: usize) -> Option<Layout> {
        Layout::from_size_align(capacity.checked_add(HEADER)?, ALIGN).ok()
    }
}
// SAFETY: Every block has a 16-byte-aligned header recording its actual usable
// size. A block is either exclusively owned by QuickJS or on exactly one list.
// QuickJS serializes allocator access on its owner thread, and drops it only
// after freeing the runtime. OOM/overflow returns null without losing old data.
unsafe impl Allocator for JavaScriptAllocator {
    fn alloc(&mut self, size: usize) -> *mut u8 {
        let Some(capacity) = Self::capacity(size) else {
            return ptr::null_mut();
        };
        if let Some(class) = Self::class(capacity) {
            let block = self.heads[class];
            if !block.is_null() {
                unsafe {
                    self.heads[class] = block.cast::<*mut u8>().read();
                }
                self.counts[class] -= 1;
                self.cached_bytes -= capacity + HEADER;
                return block;
            }
        }
        let Some(layout) = Self::layout(capacity) else {
            return ptr::null_mut();
        };
        unsafe {
            let block = alloc(layout);
            if block.is_null() {
                return block;
            }
            block.cast::<Header>().write(Header { capacity });
            block.add(HEADER)
        }
    }
    fn calloc(&mut self, count: usize, size: usize) -> *mut u8 {
        let Some(size) = count.checked_mul(size) else {
            return ptr::null_mut();
        };
        let block = self.alloc(size);
        if !block.is_null() {
            unsafe {
                ptr::write_bytes(block, 0, size);
            }
        }
        block
    }
    unsafe fn dealloc(&mut self, block: *mut u8) {
        if block.is_null() {
            return;
        }
        let capacity = Self::usable_size(block);
        if let Some(class) = Self::class(capacity) {
            if self.counts[class] < CACHE_BYTES_PER_CLASS / capacity
                && self.cached_bytes + capacity + HEADER <= CACHE_BYTES_TOTAL
            {
                block.cast::<*mut u8>().write(self.heads[class]);
                self.heads[class] = block;
                self.counts[class] += 1;
                self.cached_bytes += capacity + HEADER;
                return;
            }
        }
        dealloc(block.sub(HEADER), Self::layout(capacity).unwrap());
    }
    unsafe fn realloc(&mut self, block: *mut u8, size: usize) -> *mut u8 {
        if block.is_null() {
            return self.alloc(size);
        }
        if size == 0 {
            self.dealloc(block);
            return ptr::null_mut();
        }
        let previous = Self::usable_size(block);
        let Some(capacity) = Self::capacity(size) else {
            return ptr::null_mut();
        };
        if capacity == previous {
            return block;
        }
        if Self::class(previous).is_none() && Self::class(capacity).is_none() {
            let Some(layout) = Self::layout(capacity) else {
                return ptr::null_mut();
            };
            let resized = realloc(
                block.sub(HEADER),
                Self::layout(previous).unwrap(),
                layout.size(),
            );
            if resized.is_null() {
                return resized;
            }
            resized.cast::<Header>().write(Header { capacity });
            return resized.add(HEADER);
        }
        let resized = self.alloc(size);
        if !resized.is_null() {
            ptr::copy_nonoverlapping(block, resized, previous.min(size));
            self.dealloc(block);
        }
        resized
    }
    unsafe fn usable_size(block: *mut u8) -> usize {
        (*block.sub(HEADER).cast::<Header>()).capacity
    }
}
impl Drop for JavaScriptAllocator {
    fn drop(&mut self) {
        for class in 0..CLASSES {
            let mut block = self.heads[class];
            while !block.is_null() {
                unsafe {
                    let next = block.cast::<*mut u8>().read();
                    dealloc(
                        block.sub(HEADER),
                        Self::layout(1 << (class + MIN_SHIFT)).unwrap(),
                    );
                    block = next;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocation_reuse_resize_zeroing_and_overflow() {
        let mut allocator = JavaScriptAllocator::default();
        for size in [
            1, 15, 16, 17, 63, 64, 65, 128, 255, 1024, 2048, 4096, 4097, 10000,
        ] {
            unsafe {
                let original = allocator.alloc(size);
                assert!(!original.is_null());
                assert_eq!(original as usize % ALIGN, 0);
                assert!(JavaScriptAllocator::usable_size(original) >= size);
                ptr::write_bytes(original, 0x5a, size);
                let grown = allocator.realloc(original, size * 2);
                assert!(!grown.is_null());
                assert!(std::slice::from_raw_parts(grown, size)
                    .iter()
                    .all(|byte| *byte == 0x5a));
                let shrunk = allocator.realloc(grown, size);
                assert!(!shrunk.is_null());
                assert!(std::slice::from_raw_parts(shrunk, size)
                    .iter()
                    .all(|byte| *byte == 0x5a));
                assert!(allocator.realloc(shrunk, usize::MAX).is_null());
                allocator.dealloc(shrunk);
                let zeroed = allocator.calloc(1, size);
                assert!(std::slice::from_raw_parts(zeroed, size)
                    .iter()
                    .all(|byte| *byte == 0));
                allocator.dealloc(zeroed);
            }
        }
        assert!(allocator.calloc(usize::MAX, 2).is_null());
        let mut blocks = Vec::new();
        for _ in 0..CACHE_BYTES_PER_CLASS / 32 + 10 {
            blocks.push(allocator.alloc(32));
        }
        for block in blocks {
            unsafe {
                allocator.dealloc(block);
            }
        }
        assert_eq!(allocator.counts[1], CACHE_BYTES_PER_CLASS / 32);
        assert!(allocator.cached_bytes <= CACHE_BYTES_TOTAL);
    }
}
