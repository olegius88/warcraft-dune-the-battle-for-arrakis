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

В `.ts` остаются только строки, которые генерируются из данных (таблицы, списки юнитов, сигнатуры
`EF_`), однострочные вызовы `init` и генератор `main`/`config` карты в `src/wc3/jass.ts`
(слой формата `war3map.j`).

Выражения не вычисляются. Всё, что нужно посчитать (сумма, склейка списка, выбор по условию),
считается в `.ts` и передаётся в scope под понятным именем.

## Файлы

| Файл | Кто читает | Что внутри |
|---|---|---|
| `hub/globals.j` | `src/emperor/hub.ts` | глобальные переменные стратегической карты (хаба) |
| `hub/functions.j` | `src/emperor/hub.ts` | хаб: территории, выбор атаки, результат битвы из game cache, фазы и тех-уровни, контратаки, сюжетные миссии, музыка |
| `movie/globals.j`, `movie/player.j` | `src/emperor/movie-player.ts` | проигрыватель роликов: очередь, кадры (файлы в папке игры) на UI-фрейме поверх экрана с частотой ролика, звук WAV, субтитры и титры мест, Esc пропускает ролик, построчный отчёт `DuneTest<карта>_Movies.pld` |
| `intro/functions.j` | `src/emperor/intro.ts` | карты вступления: ролики, затем следующая карта кампании или экран кампании |
| `hub/autotest.j` | `src/emperor/hub.ts` | автотест хаба (`--autotest`): отчёт о каждом визите, одна атака |
| `mission/globals.j` | `src/emperor/mission.ts` | глобальные переменные связки миссии с кампанией (game cache, фаза, ящики, ветеранство) |
| `mission/crates.j` | `src/emperor/mission.ts` | ящики Emperor: появление и подбор по близости |
| `mission/veterancy.j` | `src/emperor/mission.ts` | ветеранство: таблица уровней (`{{vetLines}}` из Rules.txt), повышение за убийства, `SetVeterancy` |
| `mission/reinforcements.j` | `src/emperor/mission.ts` | таблица подкреплений по домам (ReinforcementValue, TechLevel) и тайминги из Rules.txt |
| `mission/damage.j` | `src/emperor/mission.ts` | урон атак по боеголовкам Rules.txt: процент боеголовки атакующего для брони цели (`{{dmgLines}}`), `BlzSetEventDamage` |
| `mission/stealth.j` | `src/emperor/mission.ts` | невидимость стоя на месте (StealthedWhenStill) с задержками из Rules.txt |
| `mission/campaign.j` | `src/emperor/mission.ts` | чтение game cache, запись результата, возврат на хаб |
| `mission/tick.j`, `mission/camera.j` | `src/emperor/mission.ts` | тик миссии; начальная камера на войсках игрока |
| `mission/debug-report.j` | `src/emperor/mission.ts` | отчёт для автотестов в `CustomMapData` |
| `mission/autowin.j` | `src/emperor/mission.ts` | автотест: победа через заданное время |
| `mission/start.j` | `src/emperor/mission.ts` | `EmpStart`: порядок запуска, триггеры, таймеры, музыка, цвета игроков |
| `battle/tech-limits.j` | `src/emperor/battle.ts` | запрет построек и юнитов выше текущего тех-уровня (`{{limitLines}}` из данных юнитов) |
| `mission/deploy.j` | `src/emperor/mission.ts` | развёртывание Kindjal / Mortar / Kobra (кнопки, смена типа через Chaos, ожидание анимации) и нож ADV Sardaukar (`{{deployLines}}`) |
| `mission/detonate.j` | `src/emperor/mission.ts` | подрыв Devastator / Infiltrator / EITS: бомбы, импульс раскрытия, саботёр EITS |
| `mission/burrow.j` | `src/emperor/mission.ts` | пылевой разведчик закапывается на DustBowl и выкапывается при приказе или враге |
| `mission/wormride.j` | `src/emperor/mission.ts` | ADV Fremen: вызов червя (тумпер), WormRider, возврат во фримена |
| `mission/teleport.j` | `src/emperor/mission.ts` | телепорт NIAB: кнопка с точкой, время анимаций, сон после переноса |
| `mission/projector.j` | `src/emperor/mission.ts` | голограммы проектора Иксианцев: создание, исчезновение от попадания и с проектором, урон выстрелов |
| `mission/apc.j` | `src/emperor/mission.ts` | APC: учёт пассажиров, гибель пассажиров вместе с APC |
| `battle/spice-fields.j` | `src/emperor/battle.ts` | поля спайса по кластерам карты; спайс, сохранённый территорией с прошлой битвы |
| `battle/carryall.j` | `src/emperor/battle.ts` | карриалы возят харвестеры к полю и к НПЗ; гибель груза со сбитым карриалом |
| `battle/orni.j` | `src/emperor/battle.ts` | боезапас орнитоптеров и перезарядка на вертолётных площадках |
| `battle/explored.j` | `src/emperor/battle.ts` | разведанная игроком карта территории: сохранение после битвы, возврат в следующей |
| `battle/economy.j` | `src/emperor/battle.ts` | харвестеры, строитель от ConYard, харвестер от очистителя, расход MCV |
| `battle/power.j` | `src/emperor/battle.ts` | энергия (Rules.txt): баланс по сторонам, отключение турелей при нехватке |
| `battle/worms.j` | `src/emperor/battle.ts` | песчаные черви: всплытие, охота, удар снизу |
| `battle/ai-map.j` | `src/emperor/battle.ts` (через `battle/ai.j`) | карта тайлов ИИ, кластеры зданий, дороги к рампам, контур и план обороны (стены, турели у дорог) — Game.exe AiMap |
| `battle/pads.j` | `src/emperor/battle.ts` | площадки НПЗ: заказ НПЗ, два слота, +здоровье, харвестер; счёт площадок для ИИ |
| `battle/forces.j` | `src/emperor/battle.ts` | стартовые силы, база врага, производство и волны, оборонительные битвы (атакующий ИИ с MCV), база, сохранённая территорией, экстренный MCV |
| `battle/init.j` | `src/emperor/battle.ts` | `EmpBattleInit`: триггеры и таймеры битвы за территорию |
| `preview/init.j` | `src/emperor/preview-map.ts` | превью рельефа: отряд на базе, маркеры точек GameElements, камера |
| `smoke/*.j` | `src/smoke/build-smoke.ts`, `build-hop.ts`, `build-bg-probe.ts`, `src/emperor/build-contest.ts --killwin` | дымовые тестовые карты: game cache, `SmokeLog`, смена уровня, `PlayCinematic`; `kill-win.j` — проверка победы по условию сценария |
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
