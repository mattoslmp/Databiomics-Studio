# Upload resumível real (TUS) + contrato único Web/Flutter

## Endpoints implementados (`upload-service`)
- `POST /uploads/tus`
- `HEAD /uploads/tus/:id`
- `PATCH /uploads/tus/:id`
- `POST /uploads/tus/:id/complete`
- `GET /uploads/sessions/:id`

## Persistência
As sessões são gravadas em `services/upload/.data/upload-sessions.json`, com:
- `workspace_id`, `user_id`, `upload_type`, `protocol=tus`, `expected_size`, `received_size`, `sha256`, `status`.

## Fluxo padrão
1. Cliente cria sessão com tamanho esperado.
2. Cliente envia chunks com `Upload-Offset`.
3. Serviço valida offset (evita corrupção).
4. Cliente finaliza e opcionalmente valida `sha256`.
5. Cliente acompanha status em `/uploads/sessions/:id`.

## Contrato único para Web + Flutter
- Web usa `packages/sdk-ts/src/upload-client.ts`.
- Flutter usa `packages/sdk-dart/lib/upload_client.dart`.
- Ambos chamam os mesmos endpoints TUS (API-first / OpenAPI).

## Exemplo de consumo
- Web: `apps/frontend-web/src/upload-flow.ts`.
- Flutter: `apps/mobile-app-flutter/lib/upload_flow.dart`.


## Retomada de upload interrompido (sem omissões)
Os SDKs agora expõem consulta de offset/length de sessão:
- TypeScript: `getTusSessionOffset(sessionId)`
- Dart: `getTusSessionOffset(sessionId)`

Os fluxos de exemplo (`apps/frontend-web` e `apps/mobile-app-flutter`) aceitam `existingSessionId` opcional e seguem este comportamento:
1. Consultam `HEAD /uploads/tus/:id`.
2. Se `404`, criam uma nova sessão.
3. Se `204`, validam `Upload-Length` vs tamanho do arquivo local.
4. Retomam o envio a partir de `Upload-Offset`.
5. Em cada `PATCH`, preferem o `Upload-Offset` retornado pelo servidor como fonte da verdade.
