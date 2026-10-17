import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:operit2/core/bridge/PlatformCoreProxy.dart';
import 'package:operit2/core/bridge/ProxyCoreRuntimeBridge.dart';
import 'package:operit2/core/host/RuntimeHostInteractionSubscriber.dart';
import 'package:operit2/core/logging/ClientLogger.dart';
import 'package:operit2/core/proxy/generated/CoreProxyClients.g.dart';
import 'package:operit2/core/proxy/generated/CoreProxyModels.g.dart';

/// Exercises the production native engine, public API and SQL bridge with fresh
/// storage. Durations are diagnostic; correctness never depends on machine speed.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'container main realm survives repeated send preparation',
    (tester) async {
      expect(Platform.isMacOS, isTrue);
      final support = await getApplicationSupportDirectory();
      final parent = await Directory(
        '${support.path}/plugin-send-performance',
      ).create(recursive: true);
      final directory = await parent.createTemp('run-');
      await platformCoreProxy.setRuntimeStorageRoots(
        '${directory.path}/runtime',
        '${directory.path}/workspace',
      );
      await ClientLogger.initialize();
      RuntimeHostInteractionSubscriber.install();
      addTearDown(RuntimeHostInteractionSubscriber.uninstall);
      const clients = GeneratedCoreProxyClients(ProxyCoreRuntimeBridge());
      final manager = clients.application.packageManager();
      const package = 'com.operit.character_cards';
      await manager.getToolPkgPublicApiOwners(
        apiName: 'chat.configuration.resolve',
      );
      final model = await clients.preferencesFunctionalConfigManager
          .getModelBindingForFunction(functionType: FunctionType.chat);
      final tts = await clients.preferences.ttsConfigManager
          .getCurrentTtsConfigId();
      final samples = <Map<String, Object?>>[];
      Future<Map<String, Object?>> resolve(String selection, int sample) async {
        final watch = Stopwatch()..start();
        final result = Map<String, Object?>.from(
          await manager.invokeToolPkgPublicApi(
                packageName: package,
                methodName: 'chat.configuration.resolve',
                payload: {
                  'purpose': 'execution',
                  'chatId': null,
                  'chatExtension': {'version': 1, 'selection': selection},
                  'messageExtension': null,
                  'participantId': null,
                  'promptFunctionType': 'CHAT',
                  'defaultModelBinding': {
                    'providerId': model.providerId,
                    'modelId': model.modelId,
                  },
                  'defaultTtsConfigId': tts,
                },
              )
              as Map,
        );
        samples.add({
          'stage': 'resolve:$selection',
          'sample': sample,
          'ms': watch.elapsedMicroseconds / 1000,
        });
        expect(result['messageExtension'], isA<Map>());
        return result;
      }

      // The first resolution measures the first use of the character main realm.
      await resolve('model:chat', -1);
      final card = Map<String, Object?>.from(
        await manager.invokeToolPkgPublicApi(
              packageName: package,
              methodName: 'character.create',
              payload: {
                'values': {
                  'name': 'Send performance role',
                  'characterSetting': 'Reply briefly.',
                },
              },
            )
            as Map,
      );
      for (var sample = 0; sample < 6; sample++) {
        await resolve('model:chat', sample);
        final result = await resolve('card:${card['id']}', sample);
        final watch = Stopwatch()..start();
        final reference = await manager.invokeToolPkgPublicApi(
          packageName: package,
          methodName: 'chat.configuration.snapshot.store',
          payload: result['messageExtension'],
        );
        samples.add({
          'stage': 'snapshot.store',
          'sample': sample,
          'ms': watch.elapsedMicroseconds / 1000,
        });
        final restored = await manager.invokeToolPkgPublicApi(
          packageName: package,
          methodName: 'chat.configuration.snapshot.read',
          payload: reference,
        );
        expect(restored, result['messageExtension']);
      }
      // A local OpenAI protocol fixture measures the complete production send path
      // without credentials, network variance or a live model's generation time.
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      Stopwatch? sendWatch;
      Completer<double>? requestBoundary;
      server.listen((request) async {
        final body = await utf8.decoder.bind(request).join();
        final payload = jsonDecode(body) as Map<String, Object?>;
        if (payload['model'] == 'send-probe' &&
            body.contains('isolated-send-probe-') &&
            requestBoundary != null &&
            !requestBoundary.isCompleted) {
          requestBoundary.complete(sendWatch!.elapsedMicroseconds / 1000);
        }
        request.response.headers.contentType = ContentType(
          'text',
          'event-stream',
        );
        request.response.write(
          'data: ${jsonEncode({
            'id': 'fixture',
            'object': 'chat.completion.chunk',
            'created': 1,
            'model': 'send-probe',
            'choices': [
              {
                'index': 0,
                'delta': {'role': 'assistant', 'content': 'fixture reply'},
                'finish_reason': null,
              },
            ],
          })}\n\n',
        );
        request.response.write(
          'data: ${jsonEncode({
            'id': 'fixture',
            'object': 'chat.completion.chunk',
            'created': 1,
            'model': 'send-probe',
            'choices': [
              {'index': 0, 'delta': {}, 'finish_reason': 'stop'},
            ],
          })}\n\ndata: [DONE]\n\n',
        );
        await request.response.close();
      });
      final configs = clients.preferences.modelConfigManager;
      final provider = await configs.createProvider(
        name: 'Isolated send fixture',
        providerTypeId: 'OPENAI',
        endpoint: 'http://127.0.0.1:${server.port}/v1/chat/completions',
      );
      final profile = (await configs.getProviderProfiles()).firstWhere(
        (p) => p.id == provider,
      );
      await configs.updateProviderProfile(
        provider: ProviderProfile.fromJson({
          ...profile.toJson(),
          'apiKey': 'isolated-fixture',
        }),
      );
      await configs.createProviderModel(
        providerId: provider,
        modelId: 'send-probe',
      );
      await configs.createProviderModel(
        providerId: provider,
        modelId: 'background-probe',
      );
      for (final function in [
        FunctionType.chat,
        FunctionType.titleGeneration,
        FunctionType.summary,
        FunctionType.roleResponsePlanner,
      ]) {
        await clients.preferencesFunctionalConfigManager.setModelForFunction(
          functionType: function,
          providerId: provider,
          modelId: function == FunctionType.chat
              ? 'send-probe'
              : 'background-probe',
        );
      }
      for (final worldbookEnabled in [false, true]) {
        if (worldbookEnabled) {
          await manager.importBundledExternalToolPkgContainer(
            containerPackageName: 'com.operit.worldbook',
          );
          expect(
            await manager.getToolPkgContainerRuntime(
              containerPackageName: 'com.operit.worldbook',
            ),
            isNotNull,
          );
          await manager.enableToolPkgContainer(
            containerPackageName: 'com.operit.worldbook',
          );
          expect(
            await manager.getEnabledPackageNames(),
            contains('com.operit.worldbook'),
          );
        }
        for (var sample = 0; sample < 4; sample++) {
          final chatId = await clients.chatRuntimeHolderMain.createNewChat(
            setAsCurrentChat: false,
            sourceChatId: null,
            input: {
              package: {'version': 1, 'selection': 'card:${card['id']}'},
            },
          );
          requestBoundary = Completer<double>();
          sendWatch = Stopwatch()..start();
          await clients.chatRuntimeHolderMain.sendUserMessage(
            promptFunctionType: PromptFunctionType.chat,
            participantId: null,
            chatIdOverride: chatId,
            messageText: 'isolated-send-probe-$sample',
            proxySenderNameOverride: null,
            chatProviderIdOverride: null,
            chatModelIdOverride: null,
            attachments: const [],
            replyToMessage: null,
            turnOptions: const ChatTurnOptions(
              persistTurn: true,
              notifyReply: false,
              hideUserMessage: false,
              disableWarning: true,
              continuation: null,
              chatInputSubmitRequestedHandled: false,
            ),
          );
          final toHttp = await requestBoundary.future.timeout(
            const Duration(seconds: 30),
          );
          await clients.chatRuntimeHolderMain
              .chatMessagesFlow(chatId: chatId)
              .firstWhere(
                (messages) => messages.any(
                  (m) =>
                      m.sender == 'ai' &&
                      m.parts.any(
                        (part) => part.content.contains('fixture reply'),
                      ) &&
                      m.completedAt > 0,
                ),
              )
              .timeout(const Duration(seconds: 30));
          samples.add({
            'stage': 'full-send-local-fixture',
            'sample': sample,
            'worldbookEnabled': worldbookEnabled,
            'toHttpReceivedMs': toHttp,
            'toReplyPersistedMs': sendWatch.elapsedMicroseconds / 1000,
          });
        }
      }
      final trace = await File(
        '${directory.path}/runtime/logs/operit.log',
      ).readAsString();
      // A fast machine must not conceal repeated realm creation. Each of these
      // calls must reuse the realm compiled by the service initialization hook.
      for (final function in [
        'chatConfigurationResolveApi',
        'chatConfigurationSnapshotStoreApi',
      ]) {
        expect(trace, contains('stage=reuse_main_script function=$function '));
        expect(
          trace,
          isNot(contains('stage=compile_main_script function=$function ')),
        );
      }
      expect(
        trace,
        isNot(
          contains('tool.execute.request tool=storage_request policy=Normal'),
        ),
      );
      final report = <String, Object?>{
        'scope':
            'macOS production QJS, CoreLink, tools and SQLite; isolated storage; first-use and retained-realm samples; full sends with/without real worldbook hooks (empty entries) use a local SSE fixture, no live model',
        'runtimeRoot': directory.path,
        'samples': samples,
      };
      binding.reportData = report;
      // Print only timing metadata, never provider credentials or user content.
      // ignore: avoid_print
      print('PLUGIN_SEND_PERFORMANCE ${jsonEncode(report)}');
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
