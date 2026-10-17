package app.operit

object OperitRuntimeNative {
    /** Accepts borrowed pipe handles from the Plugin SDK Binder endpoint. */
    @JvmStatic external fun acceptPluginSdkPipes(reader: Int, writer: Int)
    init {
        System.loadLibrary("operit_flutter_bridge")
    }

    /** Creates the Android-owned runtime with its required startup device model. */
    @JvmStatic external fun create(
        runtimeRoot: String,
        workspaceRoot: String,
        deviceModel: String,
        host: AndroidRuntimeHost,
    ): Long
    @JvmStatic external fun createError(): String
    /** Executes offline data rescue using only storage and secret-store Host adapters. */
    @JvmStatic external fun dataRescue(defaultRuntimeRoot: String, request: String, host: AndroidRuntimeHost): String
    /** Reads the client bootstrap record before the native Runtime is created. */
    @JvmStatic external fun runtimeBootstrapRead(defaultRuntimeRoot: String): String
    /** Writes the client bootstrap record before the native Runtime is created. */
    @JvmStatic
    external fun runtimeBootstrapWrite(defaultRuntimeRoot: String, content: String): String
    @JvmStatic external fun destroy(handle: Long)
    /** Creates a retained direct FFI connection to the host runtime. */
    @JvmStatic external fun connectCoreFfi(handle: Long): String


    @JvmStatic external fun emitRuntimeEvent(handle: Long, eventJson: String): String

    @JvmStatic
    external fun emitHostRuntimeEventSchedule(
        handle: Long,
        scheduleId: String,
        scheduledAtMillis: Long,
        firedAtMillis: Long,
    ): String
}
