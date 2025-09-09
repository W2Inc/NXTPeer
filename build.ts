await Bun.build({
  entrypoints: ['./index.ts'],
	target: 'bun',
	compile: 'bun-darwin-arm64',
  outdir: './build',
});
