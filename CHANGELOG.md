# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [Unreleased]

### Added
- 2026-10-08 Доставка фрегатом из Starport ([src/jass/mission/starport.j](src/jass/mission/starport.j),
  [src/emperor/units.ts](src/emperor/units.ts) `portOrders`): космопорт продаёт «заказы» (за 1 с, по
  текущей цене), фрегат прилетает через `FrigateCountdown` (2500 тиков = 100 с) и привозит до
  `StarportMaxDeliverySingle` (6) юнитов, остальные — следующим рейсом; при заказе звучит
  «There is a delivery, inbound» (`GenDelivery`). На заводе юниты строятся как раньше. Проба `--port`:
  7 заказов по 210 → 8530 кредитов, через 30 с юнитов нет, к 110 с прибыло 6, один ждёт. Запас
  (`StarportStockIncrease*`) не сделан: начального и максимального запаса в данных нет (`TODO(starport)`).
- 2026-10-08 ИИ управляет базой стороны 1 на сюжетных картах (#A1/#A2/#A3 — вторжения в родные миры,
  #C1 — гражданская война Харконненов): раньше база там стояла мёртвой, строитель, производство и
  тактики ИИ запускались только в битвах за территорию. Настройки — `ai.ini` поверх
  `ai_<дом>_<карта>.ini` (`ai_atreides_a1.ini` «Homeworld attack with AI playing Atreides»: 20 % юнитов
  дома, без обороны), кредиты — от скрипта (`AddSideCash(GetEnemySide(),40000)`). Дом стороны 1 берётся
  по её стройплощадке на карте, а не из кэша кампании
  ([src/jass/battle/forces.j](src/jass/battle/forces.j) `EmpStoryAiStart`,
  [src/emperor/battle.ts](src/emperor/battle.ts) `storyAiHouse`). Проверено в игре: на Каладане ИИ
  улучшил казармы и через 140 с послал волну (лимит `MaxAiUnits` уже занят юнитами карты); в
  гражданской войне произвёл юнитов и выслал разведчиков. Отладочный отчёт пишет `aigold` и `aiprod`.
  После четвёртого аудита (Fable 5.1): ИИ получает собственную точку базы у стройплощадки (раньше
  занимал одну из двух точек карты, и стороны скрипта, просившие базу позже, попадали на точку игрока);
  охрана карты дальше `DefenceTacticWanderDistance` и сюжетные персонажи остаются на постах (роль 4) —
  в волну на Каладане уходит 18 юнитов вместо 68. Проверены в игре все три дома: #A1 (AT), #A2 (OR),
  #C1 (HK).
- 2026-10-08 Озвучка интерфейса по `Uispoken.txt` / `sounds.txt` `IngameMessages`
  ([src/jass/runtime/helpers.j](src/jass/runtime/helpers.j) `EmpUiSay`): реплики дома игрока или общие —
  атака базы и харвестеров, потери, готовый юнит, стройка, улучшение, супероружие, захват здания, червь,
  подкрепления, лич, заражение — вместо придуманных текстов. Речь есть не для всех реплик
  (в установленном `DIALOG.BAG` её нет), такие — только текстом.
- 2026-10-08 Курганы специи ([src/jass/battle/spice-fields.j](src/jass/battle/spice-fields.j)): лопаются
  в поле специи по `[SpiceMound]` и вырастают снова. Песчаные бури
  ([src/jass/battle/storm.j](src/jass/battle/storm.j)) по `Storm*`, `[StormUnit]`, `StormDamage`. Замена
  харвестера (`HarvReplacementDelay`) и деньги, когда специя кончилась (`CashDeliveryWhenNoSpice*`). Цены
  Starport меняются (`StarportCost*`, [src/jass/mission/starport.j](src/jass/mission/starport.j)).
  Всё проверено в игре; частота урона бурь и условия экономики выведены из ключей (`TODO(storm)`,
  `TODO(economy)`).
- 2026-10-08 Апгрейды зданий по Rules.txt ([src/emperor/units.ts](src/emperor/units.ts)): здание с
  `UpgradeCost` исследует своё улучшение (`war3map.w3q`), 35 типов с `UpgradedPrimaryRequired` (Kindjal,
  Kobra, турели домов…) его требуют; запрет до `UpgradeTechLevel`. ИИ покупает улучшения и не производит
  юнитов без них. Проба [src/smoke/build-tech-probe.ts](src/smoke/build-tech-probe.ts) в 1.31.1; в игре
  ИИ купил улучшение казарм (HK_A02).
- 2026-10-08 Супероружие дворцов ([src/emperor/superweapons.ts](src/emperor/superweapons.ts),
  [src/jass/mission/superweapon.j](src/jass/mission/superweapon.j)): дворец тренирует заряд (Death Hand,
  Hawk, Chaos Lightning) за его `BuildTime`, удар — приказ «атаковать землю» в любую точку. Урон, радиус
  и радиоактивные осадки из Rules.txt; Hawk обращает врагов в бегство, Chaos Lightning приводит в
  бешенство (по описаниям cncnz.com). `SideNuke` бьёт Death Hand вместо выдуманных констант. ИИ заряжает
  свой дворец и бьёт по известной базе игрока. Проверено в игре
  ([src/smoke/build-superweapon-mission.ts](src/smoke/build-superweapon-mission.ts)).
- 2026-10-08 Starport продаёт `Starportable` юниты своего дома и общие (Harvester, MCV, Carryall).
  Колебания цен и доставка фрегатом не сделаны (`TODO(starport)`).
- 2026-10-08 Союзы с субдомами ([src/config/campaign.ts](src/config/campaign.ts) `ALLYGAIN_TAGS`):
  38 скриптов произносят «<дом>allygain<n>», когда цель выполнена («Фримены хотят обсудить с нами
  союз»); выигранная миссия, где она прозвучала, даёт союз (1 фримены, 2 сардукары, 3 Икс,
  4 Тлейлаксу), Икс и Тлейлаксу исключают друг друга. Здания союзников строит третий строитель.
  Первая версия брала союз по тегу в имени скрипта, это было неверно (ATP3M5TL — против Тлейлаксу;
  нашёл второй аудит). У гильдии реплики нет (`TODO(subhouse)`).
- 2026-10-08 Особые способности ([src/emperor/specials.ts](src/emperor/specials.ts),
  [src/jass/mission/specials.j](src/jass/mission/specials.j)): Девиатор (`DeviateDuration`,
  `CanBeDeviated`), Лич и Заразитель (`Leech_B`/`Contaminator_B`), инженер (`CanBeEngineered`), диверсант
  (`SaboteurBomb`), давка (`Crushes`/`Crushable`), ремонтник (`RepairTileRange`, `RepairRate`). В игре
  проверены все: Девиатор, Заразитель, Лич, инженер, диверсант, ремонтник, давка
  ([src/smoke/build-specials-mission.ts](src/smoke/build-specials-mission.ts)).
- 2026-10-08 Темп ИИ по `ai_difficulty.ini` для тех-уровня (`UnitDelay`, `BuildingDelay`, `MaxAiUnits`,
  `NumBuildings`, `MaxTurretsAllowed`, `FirstAttackDelay`, `GapBetweenNewScripts`, пределы обороны) вместо
  выдуманных периодов; на своей столице ИИ следует `ai_<дом>_t<N>.ini` (без обороны).
- 2026-10-08 Варианты обороны `*Fail`/`*Win` (64 скрипта): играются по итогу атаки на ту же территорию в
  той же фазе ([src/emperor/campaign-data.ts](src/emperor/campaign-data.ts) `defendVariant`; вывод из
  содержимого скриптов).
- 2026-10-08 ИИ врага в битвах за территории по `ai.ini` ([src/jass/battle/ai.j](src/jass/battle/ai.j),
  [src/emperor/ai-rules.ts](src/emperor/ai-rules.ts)):
  - строитель базы: по одному зданию той категории `BuildingConstructionRatios`, которой больше всего
    не хватает (заблокированная категория уступает следующей), на лучшем свободном месте по весам
    `PositionAlgorithmRatios*`, после `BuildTime`; правила турелей, очистительных заводов и стен из
    `[Strategy]`; ветроловушка первой при нехватке энергии;
  - пока строитель копит на здание, производство юнитов тратит только деньги сверх его стоимости;
  - тактики: разведчики, оборона базы, охрана харвестеров, защита стройплощадки, волны со сбором и
    атакой (`LargeAttackModifier`, `TicksUntilAbandonForming`);
  - отчёт `CustomMapData\DuneTest\<карта>_AI.pld` с причинами простоя. Проверено в игре (HK_A02,
    7 минут): 8 зданий, разведка, волны.
- 2026-10-08 Правило победы и поражения не считает объекты с `ExcludeFromCampaignLose` (стены, малые
  ветроловушки): сторона, у которой остались только они, побеждена
  ([src/jass/runtime/helpers.j](src/jass/runtime/helpers.j), тест в
  [test/emperor-mission.test.ts](test/emperor-mission.test.ts)).
- 2026-10-08 Ролики в полном качестве ([src/emperor/fmv.ts](src/emperor/fmv.ts)):
  - каждый кадр в родном размере 640×480 и с родной частотой (15 кадров/с, титры — 1), JPEG B,G,R,A
    качества 95, звук — WAV без потерь;
  - ~13 ГБ не помещаются в кампанию (MPQ до 4 ГБ), поэтому файлы лежат в папке Warcraft III
    (`Emperor\Movies\`) и читаются при `Allow Local Files` = 1. Проверено пробой
    [src/smoke/build-local-probe.ts](src/smoke/build-local-probe.ts): текстуры 640×480 и звук из папки
    игры работают;
  - конвертация в 16 потоках, манифест на ролик, готовые ролики не переделываются.
  Проигрыватель стал общим ([src/jass/movie/player.j](src/jass/movie/player.j)): своя частота у
  каждого ролика, построчный отчёт, беззвучный ролик не глушит музыку карты. Кадр, раз показанный в
  карте, остаётся в памяти до её конца (проба [src/smoke/build-cache-probe.ts](src/smoke/build-cache-probe.ts));
  вступление (418 с) занимает до 11 ГБ, при выходе из карты память освобождается.
- 2026-10-08 Карты вступления ([src/emperor/intro.ts](src/emperor/intro.ts)): кнопка «Вступление»
  (Legals, IntroPrologue → IntroAnimation → совет Ландсраада) и, по кнопке Дома, его ролик выбора и
  Phase0a перед стартовой миссией. Титры (Credits) больше не пропускаются.
- 2026-10-08 Субтитры роликов: речь распознана whisper.cpp
  ([src/emperor/transcribe.ts](src/emperor/transcribe.ts), петли на музыке переделываются короткими
  кусками), переведена на русский с единой терминологией
  ([src/emperor/subtitle-terms.ts](src/emperor/subtitle-terms.ts)); титры мест из `SubTitle.ini`
  ([src/emperor/subtitles.ts](src/emperor/subtitles.ts)). Проверено в игре: субтитры на затемнённой
  полосе внизу кадра.
- 2026-10-08 Экран кампании как главное меню Emperor
  ([src/emperor/menu-scene.ts](src/emperor/menu-scene.ts)): сцена `MAIN.XBF` моделью с камерой
  (вращающийся Арракис, кольца, туманности, логотип) и музыка меню `IN_Menu`. MDX получил камеры и
  глобальные последовательности ([src/wc3/mdx.ts](src/wc3/mdx.ts)), конвертер XBF — разреженные
  ключи анимации. Музыка проверена замером звука ([tools/audio-peak.ps1](tools/audio-peak.ps1)):
  пик меняется вместе с подставленным файлом.
- 2026-10-07 Ролики Emperor в хабах кампании (слайд-шоу). `PlayCinematic` из карты в 1.31.1 ничего
  не показывает, поэтому:
  - ffmpeg декодирует BIK в кадры 512×256, 2 кадра/с, а звук — в MP3
    ([src/emperor/fmv.ts](src/emperor/fmv.ts));
  - кадр — BLP1 с JPEG из четырёх плоскостей B, G, R, A без цветового преобразования (свой
    кодировщик [src/wc3/jpeg.ts](src/wc3/jpeg.ts), `writeBlpJpeg` в [src/wc3/blp.ts](src/wc3/blp.ts)).
    Проверено в игре пробой [src/smoke/build-blp-probe.ts](src/smoke/build-blp-probe.ts): обычный
    YCbCr JPEG (от ffmpeg) игра рисует серыми полосами на 3/4 ширины;
  - кадры переключает игровой таймер, звук идёт в реальном времени; в кампании они совпали с
    точностью до секунды на 323 с (проверено без человека, 2026-10-07). Хаб пишет отчёт
    `DuneTest\<дом>_Movies.pld`: очередь, кадры, длительность звука, игровое время;
  - [src/emperor/movies.ts](src/emperor/movies.ts) читает `MOVIES.TXT` с цепочками роликов;
  - таблица «событие хаба → ролики» для каждого Дома — [src/config/movies.ts](src/config/movies.ts):
    начало кампании, начало фаз, сюжетные миссии, вторжение, финал, провалы, предупреждение и
    поражение без захватов;
  - проигрыватель на UI-фрейме поверх экрана — [src/jass/hub/movie.j](src/jass/hub/movie.j), Esc
    пропускает ролик. Победа и поражение кампании ждут конца роликов;
  - около 85 МБ на хаб; `--no-movies` собирает без них, `--autotest` — без них по умолчанию;
  - проверочная карта: [src/smoke/build-fmv-probe.ts](src/smoke/build-fmv-probe.ts).
- 2026-10-07 ИИ битвы за территорию по `ai.ini` ([src/emperor/ai-rules.ts](src/emperor/ai-rules.ts),
  [src/jass/battle/forces.j](src/jass/battle/forces.j)):
  - производство — пехота/техника 20/80;
  - 24 % войск охраняют базу, остальные идут в атаку;
  - разрушенные здания шаблона базы отстраиваются при запасе 600 кредитов;
  - волна после атаки отходит с вероятностью 50 %.
  Невидимость раскрывается врагами с `UnstealthRange` (турели, разведчики).
- 2026-10-07 Настоящий рельеф карт ([src/emperor/heightmap.ts](src/emperor/heightmap.ts)).
  `test.xbf` карты — это сцена XBF из 480 кусков поверхности (8×8 тайлов). Треугольники
  переводятся в высоты углов тайлов, «юбки» кусков (y = −500) пропускаются, масштаб ×4, как у
  моделей. Раньше высота задавалась одинаковой по типу тайла. Закрыт `TODO(terrain-height)`.
- 2026-10-07 Безопасная сессия кампании без участия пользователя
  ([tools/campaign-session.ps1](tools/campaign-session.ps1)): ждёт паузы, кликает только по
  окну игры и сворачивает игру, как только пользователь возвращается. `-loadfile` кампании
  (`.w3n`) клиент 1.31 не открывает (окно ошибки, проверено 2026-10-07).
- 2026-10-07 Модели Emperor для WC3:
  - [src/emperor/xbf.ts](src/emperor/xbf.ts) читает XBF (порт xanlib, MIT);
  - [src/wc3/mdx.ts](src/wc3/mdx.ts) пишет MDX v800 — независимый читатель mdx-m3-viewer пересохраняет
    его байт в байт;
  - [src/emperor/model.ts](src/emperor/model.ts) конвертирует XBF → MDX: геометрия, оси и масштаб
    WC3, кости с анимацией узлов, последовательности Stand/Walk/Attack/Death/Birth;
  - [src/emperor/models.ts](src/emperor/models.ts) конвертирует модели всех объектов по `ArtIni.txt`
    вместе с текстурами: 235 моделей, 226 текстур, около 12 МБ.
  Карта-проба [src/smoke/build-model-probe.ts](src/smoke/build-model-probe.ts); после неё модели вошли
  в данные юнитов (`build-campaign.ts` загружает их с `models: true`).
- 2026-10-07 Иконки Emperor на командной карте ([src/emperor/icons.ts](src/emperor/icons.ts)):
  `ArtIni.txt` `Icon`/`IconGrey` → `Textures/*.tga` из 3DDATA0001 → BLP1 64×64. Цветные идут в
  `BTN…`, серые в `DISBTN…`; 105 объектов, 210 файлов. В кампании они лежат один раз в архиве
  кампании, в отдельных миссиях — в карте. Добавлены чтение TGA, BLP1 из полноцветных картинок
  (палитра median cut, мип-уровни, альфа) и запись PNG для превью. В игре проверено картой-пробой
  [src/smoke/build-icon-probe.ts](src/smoke/build-icon-probe.ts): цветная иконка видна через `uico`,
  серая находится по пути `DISBTN`.
- 2026-10-07 Фазы кампании точно по `PhaseRules.txt` ([src/emperor/phase-rules.ts](src/emperor/phase-rules.ts)):
  - фазы 1–2 длятся `Battles`/`MaxBattles` битв (нужен `Captured`), считаются битвы, а не захваты;
  - тех-уровни растут при входе в фазу и по N-му захвату в фазе;
  - в фазе 3 через `Warning` 3 битвы без новых территорий выводится предупреждение, через
    `Lose` 5 кампания проиграна.
  Закрыт `TODO(phases)`.
- 2026-10-07 Черви по Rules.txt: жертва выбирается с весом `WormAttraction`. Типы с
  `TastyToWorms = False` (генералы, учёные, раб) и Guild Maker (−20) червь не трогает. Червь,
  выползший на скалу, уходит под песок. Закрыт `TODO(worms)`
  ([src/jass/battle/worms.j](src/jass/battle/worms.j)).
- 2026-10-07 Ещё данные Rules.txt в миссиях
  ([src/jass/mission/stealth.j](src/jass/mission/stealth.j), [veterancy.j](src/jass/mission/veterancy.j)):
  - `StealthedWhenStill`: разведчики по типу, снайпер Атрейдесов с 3-го уровня ветеранства.
    Невидимы через `StealthDelay` тиков после остановки и через `StealthDelayAfterFiring` после
    выстрела.
  - `AIThreat`: стандартный приоритет целей ИИ, `SetThreatLevel` его переопределяет.
  - Самопочинка ветеранов: `CanSelfRepair` единиц здоровья за 10-тиковый период `RepairRate`.
    Раньше было выдуманное «1 % в секунду».
- 2026-10-07 Карта-проба движка [src/smoke/build-probe.ts](src/smoke/build-probe.ts). Она отвечает
  в игре на вопросы, которые не решают документация и аннотации (`naichabaobao/jass`). Ответы 1.31.1:
  - `BlzGet/SetUnitBaseDamage`: индекс 0 — первое оружие;
  - `BlzGet/SetUnitWeaponRealField` (дальность, перезарядка) не работают ни на индексе 0, ни на 1;
  - `Apiv` существует;
  - модели `AUin`/`AHfs` лежат в `EFFECT_TYPE_EFFECT`.

  Исправлено по итогам пробы: эффект удара супероружия и ящика-бомбы был пустым (модель бралась
  из пустого `EFFECT_TYPE_TARGET`). Ветеранство больше не вызывает неработающую в 1.31.1 функцию
  дальности, бонус `ExtraRange` записан в `TODO(veterancy)`.
- 2026-10-07 Битвы за территорию по Rules.txt:
  - атакующий приходит с MCV, харвестером и армией ценностью `UnitValueAttacker`;
  - обороняющийся держит базу с армией `UnitValueDefender`;
  - деньги задаются `CampaignAttackMoney`/`CampaignDefendMoney`;
  - враг платит за производство (`Cost`) из своих кредитов;
  - в обороне вместо четырёх выдуманных волн враг один раз атакует армией атакующего, дальше
    приходят его подкрепления.
  Раньше отряды и деньги были фиксированными, а производство врага — бесплатным
  ([src/jass/battle/forces.j](src/jass/battle/forces.j)).
- 2026-10-07 Подкрепления по Rules.txt. Раз в `TicksBetweenReinforcements` ±`Variation` к входу
  стороны приходят случайные юниты её дома (по `ReinforcementValue` и `TechLevel`) на сумму
  ценности волны; за `TicksBeforeReinforcementsForMessage` игрок получает сообщение. В битвах за
  территорию это относится к обеим сторонам (первая волна `UnitValueInitialReinforcements`, далее
  `UnitValueSubsequentReinforcements`). В сюжетных миссиях волны включает `SetReinforcements`.
  Теперь у всех функций API есть тела, ни одной заглушки не осталось.
- 2026-10-07 API скриптов Emperor реализован полностью, кроме `SetReinforcements`
  ([src/jass/runtime/api/](src/jass/runtime/api)):
  - камера: вращение (`CameraStartRotate`/`CameraStopRotate`), зум, `CameraIs*`;
  - PIP-окно Emperor: в WC3 нет второго вида, поэтому цель PIP открывается из тумана и отмечается
    на миникарте, отслеживаемый объект сопровождается;
  - `ReplaceShroud` закрывает области, открытые `RemoveShroud`;
  - ИИ: `SideAIEncounterIgnore`/`Attack` (идти мимо врага или атаковать по пути),
    `SideAIBehaviourNormal` (держаться у своей базы), `SetThreatLevel` (атаковать самый опасный
    тип объектов рядом);
  - ящики скриптов `NewCrate*` (деньги, юнит, бомба, невидимость, туман) исчезают через
    `Lifespan` из Rules.txt [Crate];
  - черви: `SideAttractsWorms`/`SideRepelsWorms`;
  - удар супероружия `SideNuke`/`SideNukeAll`/`FireSpecialWeapon`;
  - `ObjectUndeploy` (стройплощадка обратно в MCV), `GetIsolatedEntrance` и прочие точки.
  Модели эффектов берутся из данных стандартных способностей (`GetAbilityEffectById`), так что
  пути всегда существуют. Для служебных слов скриптов (`int`/`obj`/`pos`/`if`) функции больше
  не генерируются.

### Changed
- 2026-10-07 JASS вынесен из строк `.ts` в файлы [src/jass/](src/jass/README.md): хаб
  (`hub/*.j`), связка миссии (`mission/*.j`: ящики, ветеранство, game cache, старт), битва за территорию
  (`battle/*.j`: экономика, энергия, черви, силы и волны), превью и дымовые тестовые карты
  (`preview/`, `smoke/`) и рантайм API Emperor (`runtime/globals.j`, `runtime/helpers.j`, тело каждой
  функции `EF_<Name>` в `runtime/api/<Name>.j`). Значения подставляет строгий шаблонизатор
  [src/wc3/template.ts](src/wc3/template.ts). Код карт не изменился, кроме комментариев к
  функциям, которые теперь попадают в скрипт; тест
  [test/emperor-runtime.test.ts](test/emperor-runtime.test.ts) ловит файлы API с неверным именем.
- 2026-10-07 Все параметры вынесены в модули констант [src/config/](src/config/README.md): пути,
  дома, масштабы Emperor → WC3, коды WC3, юниты и модели, рельеф, декорации, бой, JASS-рантайм,
  кампания и ключи game cache, сюжет, хаб. Сгенерированные карты побайтно не изменились.
- 2026-10-07 Весь код переведён на TypeScript 7 (strict, ESM, без `any`): Node 24 запускает `.ts`
  напрямую, `tsc` только проверяет типы ([tsconfig.json](tsconfig.json), [CLAUDE.md](CLAUDE.md)).
  Поведение не изменилось: кампания (211 карт + `.w3n`), дымовые карты и миссия собираются
  побайтно так же, как до перехода. Git-репозиторий, коммиты по этапам.
- 2026-10-07 Линтер Oxlint с обязательным `oxlint --fix` перед коммитом (хук `.githooks/pre-commit`,
  [.oxlintrc.json](.oxlintrc.json)). ESLint не подошёл: typescript-eslint поддерживает только
  TypeScript < 6.1, а у `typescript@7` нет прежнего JS API.

### Added
- 2026-10-07 Генераторы форматов WC3 без World Editor: MPQ v0, `war3map.w3i` v31, `.w3e` v11, `.wpm`,
  `.shd`, `.doo`/`Units.doo`, `.mmp`, `.wts`, `war3campaign.w3f` v1, BLP1-миникарта, обвязка JASS
  ([src/wc3/](src/wc3/README.md)).
- 2026-10-07 Тесты `node --test`: наши файлы читаются независимым читателем mdx-m3-viewer
  ([test/](test/)).
- 2026-10-07 Дымовой тест — две карты + кампания `DuneSmoke.w3n` ([src/smoke/build-smoke.ts](src/smoke/build-smoke.ts)).
  Проверено в клиенте 3.0.0.24268: карты грузятся, рельеф/обрыв/юниты на месте, JASS выполняется,
  лог через `PreloadGenEnd` пишется, game cache сохраняется между запусками (карта 2 прочитала 42).
- 2026-10-07 Запуск игры для тестов без пароля и без захвата мыши ([tools/](tools/README.md));
  в `Battle.net.config` добавлен `AdditionalLaunchArguments` для W3 (с разрешения пользователя,
  бэкап `Battle.net.config.bak-warcraft-dune`).

- 2026-10-07 Извлечение данных Emperor из установленной игры: архивы RFH/RFD, строковые таблицы
  UTF-16 (русская локализация пользователя) ([src/emperor/](src/emperor/README.md)).
- 2026-10-07 Декомпилятор скриптов миссий `.tok` (формат восстановлен: таблица токенов из `Game.exe`,
  типы объектов из `Rules.txt`, сообщения/подсказки из строковых таблиц). Все 228 скриптов
  декомпилируются без нерешённых ссылок ([src/emperor/tok.ts](src/emperor/tok.ts),
  тесты [test/emperor-tok.test.ts](test/emperor-tok.test.ts)).

- 2026-10-07 Разбор карт Emperor: `test.xbf` мета-записи, включая расшифрованное дерево точек
  `GameElements` (базы, точки скриптов, входы с номерами соседних территорий)
  ([src/emperor/mapxbf.ts](src/emperor/mapxbf.ts)).

- 2026-10-07 Основной клиент для разработки — классический 1.31.1 (`G:\Games\Warcraft III`): запускается
  без входа в Battle.net, `w3i` по умолчанию v28 (как у редактора 1.31.1), v31 — опционально
  ([src/wc3/formats.ts](src/wc3/formats.ts), [tools/run-wc3-classic.ps1](tools/run-wc3-classic.ps1)).
- 2026-10-07 Кампания `.w3n` всегда содержит `war3campaign.wts/.imp/.w3u/.w3t/.w3b/.w3d/.w3a/.w3h/.w3q`
  (пустые, если нечего класть): без них 1.31 не показывает кампанию в списке. Карта всегда содержит
  `war3map.wts/.w3r/.w3c/.w3s/.imp` и пустые объектные файлы.

- 2026-10-07 Перенос миссий Emperor в WC3:
  - рельеф карт по типам тайлов (песок/скала/обрывы/рампы, проходимость, строить только на скале)
    ([src/emperor/terrain.ts](src/emperor/terrain.ts));
  - юниты и здания из `Rules.txt` → данные объектов WC3 на стандартных моделях, таблица урона из
    боеголовок Emperor, тех-требования, харвестеры/поля специи/строители на родных механиках WC3
    ([src/emperor/rules.ts](src/emperor/rules.ts), [src/emperor/units.ts](src/emperor/units.ts),
    [src/wc3/objects.ts](src/wc3/objects.ts));
  - транслятор скриптов миссий в JASS (все 228 проходят `pjass` 1.31.1) и библиотека API Emperor
    на JASS ([src/emperor/translate.ts](src/emperor/translate.ts), [src/emperor/runtime.ts](src/emperor/runtime.ts));
  - территориальный бой: поля специи, стартовые силы, база противника, производство и волны
    ([src/emperor/battle.ts](src/emperor/battle.ts), [src/emperor/mission.ts](src/emperor/mission.ts)).
  Проверено в 1.31.1: ATStart (стартовая миссия Атрейдесов) и ATP1M11OR на T11 запускаются и идут.
- 2026-10-07 Запуск игры в фоне: окно уходит под окна пользователя, фокус возвращается, снимок окна
  через `PrintWindow`, отладочный отчёт миссии в `CustomMapData\DuneTest`
  ([tools/wc3-window.ps1](tools/wc3-window.ps1)).

- 2026-10-07 Полная кампания `build/campaign/EmperorDune.w3n` (211 карт, все проходят `pjass`):
  кнопки «Обучение» и трёх домов, стартовые миссии, хаб «Арракис» с выбором атак, фазами, тех-уровнями
  и ответными атаками, бои за территории (атака и оборона волнами), сюжетные миссии (хайлайнер,
  оборона и штурм родных миров, финал), передача состояния через game cache
  ([src/emperor/campaign-data.ts](src/emperor/campaign-data.ts), [src/emperor/hub.ts](src/emperor/hub.ts),
  [src/emperor/build-campaign.ts](src/emperor/build-campaign.ts)).
- 2026-10-07 Размещённые на картах объекты: базы и войска сюжетных карт (владелец 1 — противник,
  0 — игрок), деревья, дома, бочки, обломки ([src/emperor/mission.ts](src/emperor/mission.ts)).
- 2026-10-07 Ящики дают подарок из `Rules.txt` (`CrateGiftObject`: сардаукары, инфильтраторы, лич,
  контаминатор, `CASH2000`) юниту, который к ним подъехал ([src/emperor/rules.ts](src/emperor/rules.ts),
  [src/emperor/mission.ts](src/emperor/mission.ts), тест [test/emperor-mission.test.ts](test/emperor-mission.test.ts)).
- 2026-10-07 Ветеранство из `Rules.txt`: убийца получает `Score` жертвы, на порогах `VeterancyLevel`
  юнит получает здоровье, урон, броню, дальность, скорость, саморемонт, знак элиты
  ([src/emperor/rules.ts](src/emperor/rules.ts), [src/emperor/mission.ts](src/emperor/mission.ts)).
  В игре ещё не проверялось.
- 2026-10-07 Оригинальная озвучка сообщений миссий: `DATA\Sounds\sounds.txt` связывает ключ сообщения
  с репликой `DIALOG.BAG`, карта импортирует только свои реплики, `Message()` ставит их в очередь
  (по одной, по известной длительности). Проверено в 1.31.1: IMA ADPCM WAV и MP3 открываются движком
  ([src/emperor/bag.ts](src/emperor/bag.ts), [src/emperor/speech.ts](src/emperor/speech.ts),
  [src/emperor/runtime.ts](src/emperor/runtime.ts)).
- 2026-10-07 Автотест переходов кампании: `build-campaign.ts --autotest` (миссии побеждают сами,
  хаб пишет отчёты и сам атакует) и инструменты `tools/wc3-guard.ps1`, `tools/wc3-ui.ps1`
  (действия в меню только когда пользователь не пользуется компьютером).
- 2026-10-07 Тестовые прогоны пишут JPEG и GIF игрового окна для показа в чате
  ([tools/test-maps.ps1](tools/test-maps.ps1), [tools/make-gif.ts](tools/make-gif.ts); devDependencies `gifenc`, `pngjs`).

### Fixed
- 2026-10-08 Третий независимый аудит (Fable 5.1), исправлено с регрессионными тестами
  ([test/emperor-mission.test.ts](test/emperor-mission.test.ts)) и проверено в игре:
  - особые способности ([src/jass/mission/specials.j](src/jass/mission/specials.j)): сюжетные
    персонажи (`TastyToWorms = FALSE`) не заражаются и не берутся пиявкой; пиявка не цепляется к
    летающим, червю и нейтралам; новая пиявка выходит только из убитого носителя, а не из убранного
    (MCV развернулся); диверсант не взрывается у стен; ремонтник не чинит `CanBeRepaired = FALSE`;
    давит только движущийся давитель (раньше — любой с приказом, в том числе стреляющий на месте;
    в игре проверено, что движущийся давит; что стоящий не давит — только регрессионным тестом);
    запомненная позиция давителя стирается с его смертью (номера хэндлов переиспользуются);
  - песчаная буря ([src/jass/battle/storm.j](src/jass/battle/storm.j)): `StormDamage` разбирается как
    `класс * 64 + урон`; класс 0 «only damages, is never picked up» — технику буря больше не уносит,
    пехоту уносит (проба: трайки 8/8, пехота 7/8);
  - Starport ([src/jass/mission/starport.j](src/jass/mission/starport.j)): разница цены фиксируется при
    старте покупки и платится, когда юнит готов; отмена возвращает штатную цену и больше не даёт
    заработать на скидке (проба: 10000 → 9700 → отмена 9700 → готов 9790 при 70 % от 300);
  - строители ([src/jass/battle/economy.j](src/jass/battle/economy.j)): если у игрока не осталось ни
    одного, стройплощадки выдают их снова (проба `--builders`: 2 → убраны → снова 2).
  - четвёртый аудит: Starport рассчитывается только Starport-ом и стирает запись (завод, получивший
    номер хэндла уничтоженного Starport, брал его цену); выживший строитель субдома больше не мешает
    выдаче обычных строителей.
- 2026-10-08 Карта AT_A07 роняла клиент 1.31 при загрузке («Not enough memory… Requested 437369793696
  bytes»): длинный брифинг был вписан прямо в `w3i` и `config()`. Как в картах редактора, тексты карты
  теперь в `war3map.wts` со ссылками `TRIGSTR_nnn` ([src/wc3/map.ts](src/wc3/map.ts), регрессия в
  [test/wc3-map.test.ts](test/wc3-map.test.ts)); найдено сессией кампании, причина сужена пробой
  [src/smoke/build-territory-probe.ts](src/smoke/build-territory-probe.ts).
- 2026-10-08 Строители появлялись только у построенной игроком стройплощадки; у готовых баз (оборона,
  сюжетные карты, скрипты) игрок не мог строить. Теперь их получает любая стройплощадка игрока.
- 2026-10-08 Оборона HK_D01 всегда шла в варианте Fail: её пара — атака на собственную столицу, которая
  не играется. Такие пары больше не выбирают вариант.
- 2026-10-08 Юниты в бешенстве или переманенные не считались за свою сторону, и при последних таких
  юнитах засчитывалось поражение; счётчик хранит сторону и при удалении юнита.
- 2026-10-08 Кнопки найма, исследования и стройки брали ячейку у стандартной базы и перекрывали друг
  друга; теперь у каждой своя ячейка, точка сбора (3,1) свободна (проба
  [src/smoke/build-button-probe.ts](src/smoke/build-button-probe.ts)). 12 зданий дома не помещались в одно
  меню стройки: стены и турели строит «Строитель укреплений».
- 2026-10-08 ИИ: резерв денег не застревает при раннем выходе; в категории строится тип, которого
  меньше всего (было 5 казарм и ни одной фабрики).
- 2026-10-08 Перенос строки в сообщениях игры записывался как `|n` и выводился как есть
  («Атака: Shield Wall|nВерховный…»); теперь это `\n` ([src/wc3/jass.ts](src/wc3/jass.ts), регрессия в
  [test/jass.test.ts](test/jass.test.ts)). Проверено в игре.
- 2026-10-08 Имена 56 юнитов и зданий в WC3 были длинными описаниями: ключ (например, `ATTrike`) есть
  и в `ObjectTips` (имя), и в озвученном `UnitBriefing` (`Uispoken.txt`), а локализованные строки
  искались только по ключу. Теперь поиск идёт по секции и ключу
  ([src/emperor/context.ts](src/emperor/context.ts), регрессия в
  [test/emperor-context.test.ts](test/emperor-context.test.ts)).
- 2026-10-08 Цепочки `MOVIES.TXT` шли по имени события (+«e» или замена последней буквы) и
  зацикливались на `IntroPrologue`; теперь следующий ролик — следующая строка того же контекста
  ([src/emperor/movies.ts](src/emperor/movies.ts), регрессия в [test/movies.test.ts](test/movies.test.ts)).
- 2026-10-08 Расшифровки whisper с кавычками в тексте не читались: фильтр ffmpeg не экранирует их
  ([src/emperor/subtitles.ts](src/emperor/subtitles.ts), регрессия в
  [test/subtitles.test.ts](test/subtitles.test.ts)).
- 2026-10-08 Заставка: планета была чёрной (туман экрана кампании и тёмные туманности, наложенные по
  альфе), текстуры `@nebulas_256` и `%nebulas_256` получали один путь
  ([src/config/menu.ts](src/config/menu.ts), [test/mdx.test.ts](test/mdx.test.ts)).
- 2026-10-07 Миссия кампании не запускалась без человека: экран масштабирован на 125 %, а скрипты
  `tools/*.ps1` не были DPI-aware. Координаты масштабировались, снимки окна обрезались на четверть, и
  кнопка миссии, найденная по такому снимку, промахивалась. Теперь скрипты работают в физических
  пикселях, и миссия запускается кликом-сообщением окну игры
  ([tools/campaign-session.ps1](tools/campaign-session.ps1)). Окна «поверх всех» больше не
  перекрывают клик: на время клика игра тоже topmost ([tools/wc3-ui.ps1](tools/wc3-ui.ps1)).
- 2026-10-07 Хаб не заполнял таблицу кадров роликов (`EmpMovieData`), и проигрыватель пропускал все
  ролики — найдено прогоном в игре; регрессия в [test/movies.test.ts](test/movies.test.ts).
- 2026-10-07 Сессия кампании ([tools/campaign-session.ps1](tools/campaign-session.ps1)) 20 минут
  делала снимки экрана кампании, хотя миссия не запустилась, и снова и снова сворачивала игру.
  Теперь сессия сразу заканчивается, а снимок не делается, пока пользователь активен. Пропущенный
  клик пишет, какое окно мешает ([tools/wc3-ui.ps1](tools/wc3-ui.ps1)).
- 2026-10-07 Денежные ящики давали 500 кредитов вместо `CASH2000` (шаблон `CASH<n>` потерял
  обратный слеш); затронуты 36 карт ([src/emperor/mission.ts](src/emperor/mission.ts), регрессия
  [test/emperor-mission.test.ts](test/emperor-mission.test.ts)).
- 2026-10-07 Подарок ящика обрезался на строчной «s» (`split(/s+/)`: обратный слеш съел heredoc);
  на данных игры не проявлялось ([src/emperor/rules.ts](src/emperor/rules.ts), регрессия
  [test/emperor-rules.test.ts](test/emperor-rules.test.ts)).
- 2026-10-07 Сюжетные миссии хайлайнера сразу заканчивались «Победой»: фрегаты-фабрики противника
  отбрасывались как декорация, а условие победы скрипта — «у врага не осталось фрегатов»
  ([src/emperor/mission.ts](src/emperor/mission.ts), регрессия [test/emperor-mission.test.ts](test/emperor-mission.test.ts)).
- 2026-10-07 На сюжетных картах камера стартовала в пустом углу: если ни скрипт, ни бой камеру не
  ставят, она центрируется на войсках игрока (регрессия в том же файле).
- 2026-10-07 Ящики были предметами WC3 `gold` и все давали одно и то же; у юнитов Emperor нет
  способности «Инвентарь», так что подобрать их, вероятно, было нечем (в игре не проверялось).
  Теперь подбор — проверка расстояния раз в 0,5 с ([src/emperor/mission.ts](src/emperor/mission.ts)).
- 2026-10-07 Игра при тестовом запуске захватывала мышь (ограничивала курсор своим окном в конце
  загрузки, даже в фоне): сторож в [tools/run-wc3-classic.ps1](tools/run-wc3-classic.ps1) снимает
  ограничение за ≤30 мс и возвращает фокус ([tools/README.md](tools/README.md)).
- 2026-10-07 `real()` округлял до 0.1: таймер тика Emperor (0.04 с) превращался в 0.0 и скрипты миссий
  выполнялись тысячи раз в секунду ([src/wc3/jass.ts](src/wc3/jass.ts), регрессия
  [test/jass.test.ts](test/jass.test.ts)).
- 2026-10-07 Падение клиента 3.0 (`0xC0000005`) при загрузке и превью наших карт: не хватало
  `war3mapMap.blp`. Теперь миникарта генерируется всегда ([src/wc3/map.ts](src/wc3/map.ts),
  регрессия [test/wc3-map.test.ts](test/wc3-map.test.ts)).

### Known issues
- `ChangeLevel` (через `CustomVictoryBJ`) из наших карт роняет и 3.0, и 1.31 вне кампании (`-loadfile`,
  меню «Сражения»). Внутри `.w3n` переход работает: цепочка «Вступление → ролик Дома → стартовая
  миссия» проверена в сессии кампании ([tools/campaign-session.ps1](tools/campaign-session.ps1)).
- `PlayCinematic` с импортированным `.bik` ничего не показывает; ролики играет свой проигрыватель кадров
  ([src/jass/movie/player.j](src/jass/movie/player.j)).
- Отдельные копии карт (`build/<…>/maps/*.w3x`) не содержат импортов кампании: юниты там видны только
  тенями. Внешний вид проверяется в сессии кампании.
- Ветеранская прибавка дальности (`ExtraRange`) не применяется: в 1.31.1 установка дальности оружия юниту
  ничего не меняет (проба [src/smoke/build-range-probe.ts](src/smoke/build-range-probe.ts)).
