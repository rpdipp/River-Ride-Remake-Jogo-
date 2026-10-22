# River Strike 1944

Remake moderno do clássico **River Raid** (Atari 2600, 1982) para Android, ambientado na
Segunda Guerra Mundial: você pilota um **P-51D Mustang** (com as faixas de invasão do Dia D)
sobre um rio da França ocupada em 1944, com câmera traseira em terceira pessoa a ~45°.

> O nome "River Raid" é marca registrada da Activision; por isso o projeto usa "River Strike 1944".

## Jogabilidade (fiel ao original)

| Original (Atari)        | Remake 1944                              | Pontos |
|-------------------------|------------------------------------------|-------:|
| Navio-tanque            | Lancha patrulha alemã (S-boot)           | 30     |
| Helicóptero             | Tanque Panzer na margem (atira em você)  | 60     |
| Depósito de combustível | Barcaça "FUEL" (sobrevoe para abastecer) | 80     |
| Jato                    | Caça Messerschmitt Bf 109                | 100    |
| Ponte                   | Ponte de pedra da vila                   | 500    |

- Tocar a margem, uma ponte intacta, uma lancha ou um Bf 109 = perde uma vida.
- Combustível acaba com o tempo — reabasteça voando por cima das barcaças FUEL.
- Destruir uma ponte salva o checkpoint; o trecho do rio é sempre o mesmo (gerado por semente).
- Vida extra a cada 10.000 pontos. A dificuldade aumenta a cada ponte.

## Controles

- **Joystick virtual** (metade esquerda da tela, aparece onde você toca):
  ← → desvia · ↑ acelera · ↓ freia
- **Botão FOGO** (metade direita): metralhadoras .50
- Botão **voltar** do Android: pausa/continua.
- No PC (teste): setas/WASD + Espaço, P pausa.

## Tecnologia

- **Three.js** (WebGL) — modelos 3D, terreno, água e efeitos 100% procedurais (sem assets externos).
- **Vite** — build.
- **Capacitor 7** — empacota como app Android nativo (APK/AAB).
- Áudio sintetizado em tempo real (Web Audio): motor, metralhadoras, explosões.
- Qualidade adaptativa: reduz resolução/sombras automaticamente em aparelhos mais fracos.

```
src/
  game.js      loop principal, estados, colisões, câmera, HUD
  world.js     streaming de trechos do rio, pontes e inimigos
  river.js     geração procedural do rio (curvas, ilhas, pontes)
  terrain.js   malha do terreno, campos/sebes, árvores, casas, igreja
  models.js    P-51, Bf 109, lancha, barcaça, tanque, ponte
  effects.js   partículas (fogo, fumaça, flak, respingos), destroços
  audio.js     sons sintetizados
  input.js     joystick virtual e botão de tiro
  textures.js  texturas geradas em canvas (insígnias, placa FUEL, água)
dev/bot.js     piloto automático de teste (só desenvolvimento)
pc/            versão do jogo em arquivo único, aberta pelo "Jogar no PC.bat"
android/       projeto Android (Capacitor)
```

## Jogar no PC (Windows)

1. Baixe o projeto (botão **Code → Download ZIP** no GitHub) e extraia.
2. Dê dois cliques em **`Jogar no PC.bat`**.

O jogo abre numa janela própria do Edge ou do Chrome, sem instalar nada (o jogo inteiro
está em `pc/index.html`). Controles: setas ou WASD para pilotar, **Espaço** atira,
**P** pausa, **Enter** decola.

Depois de mudar o código, gere de novo a versão para PC com `npm run build:pc`.

## Rodar no PC (desenvolvimento)

```bash
npm install
npm run dev
```

Abra http://localhost:5173 (use o modo celular do DevTools para simular toque).

## Gerar o APK

Requer Android Studio (SDK 35 + JDK 21 que vem junto em `jbr`).

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
Ou abra a pasta `android/` no Android Studio e clique em Run com o celular conectado.

Para publicar na Play Store: `./gradlew bundleRelease` com uma chave de assinatura própria.
