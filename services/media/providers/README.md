# Media Provider SDK

O core conhece apenas `MediaProvider`, `MediaTarget` e ações sem marca. O provider
representa catálogo/conta; o target representa o endpoint físico de reprodução.
`MediaRegistry.resolve()` escolhe ambos por pedido explícito, preferência padrão ou
preferência de cômodo.

`FakeMediaProvider` é a referência executável. Rode `runMediaProviderContract()` para
validar resolução, busca, play, pause/resume, volume e stop sem conta ou aparelho real.
