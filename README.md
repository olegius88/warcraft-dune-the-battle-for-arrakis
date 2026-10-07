# warcraft-dune

Конвейер сборки, который превращает данные **вашей собственной копии** *Emperor: Battle for Dune*
(и, как запасной вариант, *Dune II*) в кампанию для **Warcraft III Reforged** (`.w3n`).

В репозитории только инструменты. Игровые данные (карты, тексты, звук, ролики) берутся из
установленной у пользователя игры во время сборки и **не распространяются**; собранная `.w3n`
предназначена для личного использования.

## Принятые решения (2026-10-07)

- Цель — Emperor: Battle for Dune; Dune II — запасной/проверочный вариант.
- Кампания — хаб-карта Арракиса (33 территории, фазы, контратаки ИИ), состояние между картами в game cache.
- Модели — модели самого Emperor (XBF → MDX, с анимацией, цветом дома и иконками), рельеф — из сетки
  поверхности карт; стандартные модели WC3 остаются только там, где у объекта нет своей.
- Тексты — русский перевод.
- Целевой клиент — Reforged 3.0.0.24268 (форматы w3i 31 / w3e 11 / doo 8.11, скрипт JASS); для
  разработки и тестов — классический 1.31.1 (w3i 28), он запускается без входа в Battle.net.
- Код — TypeScript 7 (strict, ESM); Node 24 запускает `.ts` напрямую, `tsc` только проверяет типы.
  Линтер — Oxlint (ESLint с TypeScript 7 не работает). Правила — [CLAUDE.md](CLAUDE.md).

## Структура

| Путь | Назначение |
|---|---|
| `src/wc3/` | Генераторы форматов WC3: MPQ, w3i, w3e, wpm, shd, doo, wts, w3f, BLP, MDX, TGA, JASS-обвязка. См. `src/wc3/README.md`. |
| `src/smoke/` | Дымовой тест: две сгенерированные карты + кампания. |
| `src/emperor/` | Emperor → WC3: данные игры, декомпилятор и транслятор скриптов, миссии, хаб, кампания, речь. См. `src/emperor/README.md`. |
| `src/jass/` | JASS-код карт (шаблоны `.j`). См. `src/jass/README.md`. |
| `src/config/` | Все параметры: модули с константами (пути, масштабы, коды WC3, таймеры, кампания…). См. `src/config/README.md`. |
| `types/` | Объявления типов для пакетов без своих (`gifenc`). |
| `tools/` | Запуск игры для тестов без ввода пароля и без захвата мыши. См. `tools/README.md`. |
| `test/` | `node --test`: наши файлы — независимым читателем (mdx-m3-viewer), данные Emperor, регрессии. |
| `build/` | Результаты сборки (в `.gitignore`). |

## Команды

```powershell
npm install            # зависимости + хук pre-commit (oxlint --fix)
npm test               # tsc + oxlint + тесты
node src/emperor/extract.ts
node src/emperor/build-campaign.ts --check
& ./tools/test-maps.ps1 -Maps 'HK_A05.w3x' -Seconds 40 -Gif
```

## Источники форматов

- https://github.com/ChiefOfGxBxL/WC3MapSpecification
- mdx-m3-viewer (MIT) — читатели, которыми проверяются наши файлы в тестах
- StormLib (алгоритмы MPQ), War3Net (`CampaignInfo`), jass-history (common.j/blizzard.j 3.0.0.24268)
- Emperor: ebfd-re (RFH/RFD), OpenEBfD, xanlib; Dune II: OpenDUNE
