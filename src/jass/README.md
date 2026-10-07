# src/jass — JASS-код генерируемых карт

Код на **JASS** (скриптовый язык Warcraft III), который раньше был зашит строками в `.ts`, лежит
здесь файлами `.j`. TypeScript читает их и подставляет значения шаблонизатором
[src/wc3/template.ts](../wc3/template.ts). Путь к файлу даёт `jassFile('<dir>/<name>')` из
[src/config/paths.ts](../config/paths.ts).

## Синтаксис подстановок

| Тег | Что выводит |
|---|---|
| `{{path}}` | значение по пути в scope (`a.b`, индекс массива — `a.0`) как текст |
| `{{real path}}` | число как JASS-литерал real (`real()` из `src/wc3/jass.ts`) |
| `{{str path}}` | строку как JASS-литерал в кавычках с экранированием (`str()`) |
| `{{#if path}}…{{else}}…{{/if}}`, `{{#unless path}}…{{/unless}}` | условные блоки, вложенные допускаются |

Шаблонизатор строгий: неизвестный путь, `undefined`, неверный тип или несбалансированный блок
дают ошибку сборки. Шаблон и код, который его заполняет, не могут разойтись незаметно. Ключ,
который объявлен со значением `undefined`, в условии считается ложью. Одна завершающая пустая
строка файла в шаблон не входит; CRLF приводится к LF.

Выражения не вычисляются. Всё, что нужно посчитать (сумма, склейка списка, выбор по условию),
считается в `.ts` и передаётся в scope под понятным именем.

## Файлы

| Файл | Кто читает | Что внутри |
|---|---|---|
| `hub/globals.j` | `src/emperor/hub.ts` | глобальные переменные стратегической карты (хаба) |
| `hub/functions.j` | `src/emperor/hub.ts` | хаб: территории, выбор атаки, результат битвы из game cache, фазы и тех-уровни, контратаки, сюжетные миссии, музыка |
| `hub/autotest.j` | `src/emperor/hub.ts` | автотест хаба (`--autotest`): отчёт о каждом визите, одна атака |
| `runtime/globals.j` | `src/emperor/runtime.ts` | глобальные переменные рантайма API Emperor |
| `runtime/helpers.j` | `src/emperor/runtime.ts` | вспомогательные функции рантайма (стороны, подсчёт, ИИ, речь, конец миссии) |
| `runtime/api/<Name>.j` | `src/emperor/runtime.ts` | тело функции `EF_<Name>` API миссий Emperor |

### runtime/api

Один файл — одна функция API скриптов миссий Emperor (таблица токенов `Game.exe`). Сигнатуру
`function EF_<Name> takes … returns …` генерирует `buildRuntime()`; параметры называются
`a1..aN` по порядку объявления. Файл содержит только тело с отступом в 4 пробела. Функция без
файла получает заглушку с `// TODO(runtime)`. Если функция ничего не возвращает, а тело
начинается с `return <выражение>`, то `return` заменяется на `call`.

Scope этих файлов: `RT` (`src/config/runtime.ts`), `EFFECT`, `WC3_UNITS_PER_TILE`, `FACING`
(угол по умолчанию как real), `TPS` (тиков в секунду как real), `airstrikeTicks`.

Имя файла должно совпадать с именем функции из таблицы токенов. Иначе файл не используется, а
функция молча остаётся заглушкой. Это проверяет `test/emperor-runtime.test.ts`.

Группы функций:

- общие: ModelTick, Random, Multiplayer, Neg, SetValue, стороны (GetPlayerSide, GetEnemySide,
  CreateSide, …), деньги и спайс (GetSideCash, AddSideCash, …), цвета сторон;
- точки: GetScriptPoint, GetSideBasePoint, входы и выходы (GetEntrancePoint…, GetExitPoint),
  GetSidePosition, GetObjectPosition, SetTilePos;
- объекты: NewObject…, BuildObject, Object* (здоровье, смена стороны, удаление, развёртывание,
  «рядом» и «виден»), Side*Count, SideNearTo*, SideVisibleToSide;
- события: EventSideAttacksSide, EventObjectAttacksSide, EventObjectConstructed,
  EventObjectTypeConstructed, EventObjectDelivered;
- сообщения: Message, GiftingMessage, TimerMessage, TimerMessageRemove;
- дипломатия: SideFriendTo, SideEnemyTo, SideNeutralTo, SideChangeSide;
- ИИ: SideAI*;
- миссия: MissionOutcome, EndGameWin, EndGameLose, NormalConditionLose;
- туман, радар, камера, интерфейс: RemoveShroud…, Radar*, Camera*, PIP*, DisableUI/EnableUI,
  FreezeGame/UnFreezeGame;
- подкрепления и доставки: CarryAllDelivery, Delivery, StarportDelivery, NewCrate*,
  ForceWormStrike, AirStrike, AirStrikeDone, SetVeterancy, SideNuke, SideNukeAll.

## Проверка

- `npm run campaign` прогоняет все сгенерированные скрипты через pjass.
- Правка, которая не должна менять поведение, проверяется побайтным сравнением собранных карт
  (см. [CLAUDE.md](../../CLAUDE.md)).
