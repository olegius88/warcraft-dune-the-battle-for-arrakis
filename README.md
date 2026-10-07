# warcraft-dune

Конвейер сборки, который превращает данные **вашей собственной копии** *Emperor: Battle for Dune*
(и, как запасной вариант, *Dune II*) в кампанию для **Warcraft III Reforged** (`.w3n`).

В репозитории только инструменты. Игровые данные (карты, тексты, звук, ролики) берутся из
установленной у пользователя игры во время сборки и **не распространяются**; собранная `.w3n`
предназначена для личного использования.

## Принятые решения (2026-10-07)

- Цель — Emperor: Battle for Dune; Dune II — запасной/проверочный вариант.
- Кампания — хаб-карта Арракиса (33 территории, фазы, контратаки ИИ), состояние между картами в game cache.
- Модели — сначала стандартные модели WC3/Reforged, конвертация XBF→MDX отдельным этапом.
- Тексты — русский перевод.
- Целевой клиент — Reforged 3.0.0.24268 (форматы w3i 31 / w3e 11 / doo 8.11, скрипт JASS).

## Структура

| Путь | Назначение |
|---|---|
| `src/wc3/` | Генераторы форматов WC3: MPQ, w3i, w3e, wpm, shd, doo, wts, w3f, BLP-миникарта, JASS-обвязка. См. `src/wc3/README.md`. |
| `src/smoke/` | Дымовой тест: две сгенерированные карты + кампания. |
| `src/emperor/` | Данные Emperor: архивы RFH/RFD, строки, декомпилятор скриптов `.tok`, точки карт. См. `src/emperor/README.md`. |
| `tools/` | Запуск игры для тестов без ввода пароля и без захвата мыши. См. `tools/README.md`. |
| `test/` | `node --test`: проверка наших файлов независимым читателем (mdx-m3-viewer). |
| `build/` | Результаты сборки (в `.gitignore`). |

## Команды

```powershell
npm install
npm test
node src/smoke/build-smoke.js --bik 'G:\Games\Emperor\DATA\MOVIES\A01_F00E.BIK'
pwsh tools/run-wc3.ps1 -Map build\smoke\Smoke1.w3x -Seconds 45
```

## Источники форматов

- https://github.com/ChiefOfGxBxL/WC3MapSpecification
- mdx-m3-viewer (MIT) — читатели, которыми проверяются наши файлы в тестах
- StormLib (алгоритмы MPQ), War3Net (`CampaignInfo`), jass-history (common.j/blizzard.j 3.0.0.24268)
- Emperor: ebfd-re (RFH/RFD), OpenEBfD, xanlib; Dune II: OpenDUNE
