// ============================================================================
// Copyright (C) 2024 W2Wizard
// See README in the root of the project for license details.
// ============================================================================

import { $ } from "bun";

// NOTE(W2): Due to docker still using Swagger 2.0, we need to convert it to OpenAPI 3.0.
const id = Bun.randomUUIDv7('base64url');
await $`mkdir -p /tmp/${id}`
await $`curl -o /tmp/${id}/openapi.yaml https://docs.docker.com/reference/api/engine/version/v${Bun.env.DOCKER_VERSION ?? "1.44"}.yaml`;
await $`curl -o /tmp/${id}/openapi.json https://converter.swagger.io/api/convert -H "Content-Type: application/yaml" --data-binary "@/tmp/${id}/openapi.yaml"`;
await $`bunx openapi-typescript /tmp/${id}/openapi.json -o ./src/docker/engine.d.ts`;
await $`rm -rf /tmp/${id}/`;
console.log("Docker OpenAPI types generated!");
