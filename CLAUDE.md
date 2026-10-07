# warcraft-dune — правила проекта

Конвертер Emperor: Battle for Dune → кампания Warcraft III. Устройство — [README.md](README.md),
[src/emperor/README.md](src/emperor/README.md), [src/wc3/README.md](src/wc3/README.md),
[tools/README.md](tools/README.md).

## Код

- TypeScript (ESM), полная типизация, `strict`. Node 24 запускает `.ts` напрямую (type stripping),
  `tsc` только проверяет типы (`npm run typecheck`). Поэтому только «стираемый» синтаксис:
  без `enum`, `namespace`, parameter properties (`erasableSyntaxOnly` в `tsconfig.json`).
- Импорты своих модулей — с явным `.ts`; типы — через `import type`.
- Без `any`, без `// @ts-ignore`. Для пакетов без типов — объявления в [types/](types/README.md).

## Перед каждым коммитом

1. `npm run lint:fix` — **всегда** (линтер с автоисправлением). Хук `.githooks/pre-commit` делает это
   для подготовленных `.ts` файлов сам и не пускает коммит с оставшимися ошибками; включается
   `npm install` (скрипт `prepare`).
   Линтер — **Oxlint** ([.oxlintrc.json](.oxlintrc.json)), а не ESLint: проект на TypeScript 7, а
   typescript-eslint поддерживает только TypeScript < 6.1 (у пакета `typescript@7` нет прежнего
   JS API). Oxlint сам разбирает TypeScript и от версии компилятора не зависит.
2. `npm test` — проверка типов (TypeScript 7), Oxlint, тесты.
3. Изменения генерации карт сверять с эталонной сборкой (побайтно): кампания собирается
   детерминированно, хэши `build/campaign/maps/*.w3x` до/после должны совпадать, если поведение
   менять не собирались.

Коммиты — этапами, Conventional Commits, описание по-русски. Пушить — только по отдельной просьбе.
