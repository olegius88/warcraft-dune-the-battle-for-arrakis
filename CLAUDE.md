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
- **Все параметры — в [src/config/](src/config/README.md)** (модули с константами): пути, масштабы,
  таймеры, радиусы, коды WC3, ключи кэша, имена карт, таблицы соответствий, тексты интерфейса
  кампании. В коде — только ссылки на них; новое число/строку-идентификатор сначала объявить там.
  В модулях форматов (`src/wc3`, разбор файлов Emperor) остаются только константы спецификаций.
- **JASS — в файлах [src/jass/](src/jass/README.md)**, а не строками в `.ts`. Код читает их через
  `renderFile(jassFile(...), scope)` (шаблоны `{{…}}`, [src/wc3/template.ts](src/wc3/template.ts));
  в `.ts` остаётся только то, что генерируется из данных (таблицы, списки, сигнатуры).

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
