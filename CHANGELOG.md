# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [Unreleased]

### Added
- 2026-10-07 Ролики Emperor в хабах кампании (слайд-шоу). `PlayCinematic` из карты в 1.31.1 ничего
  не показывает, поэтому:
  - ffmpeg переводит кадры BIK в JPEG 512×512, 2 кадра/с, а звук — в MP3
    ([src/emperor/fmv.ts](src/emperor/fmv.ts));
  - кадры упаковываются в BLP1 с JPEG ([src/wc3/blp.ts](src/wc3/blp.ts) `blpFromJpeg`,
    [src/wc3/jpeg.ts](src/wc3/jpeg.ts)). Проверено в игре: обычный YCbCr JPEG от ffmpeg
    показывается с верными цветами;
  - [src/emperor/movies.ts](src/emperor/movies.ts) читает `MOVIES.TXT` с цепочками роликов;
  - таблица «событие хаба → ролики» для каждого Дома — [src/config/movies.ts](src/config/movies.ts):
    начало кампании, начало фаз, сюжетные миссии, вторжение, финал, провалы, предупреждение и
    поражение без захватов;
  - проигрыватель на UI-фрейме поверх экрана — [src/jass/hub/movie.j](src/jass/hub/movie.j), Esc
    пропускает ролик. Победа и поражение кампании ждут конца роликов;
  - около 60 МБ на хаб; `--no-movies` собирает без них, `--autotest` — без них по умолчанию;
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
  Карта-проба [src/smoke/build-model-probe.ts](src/smoke/build-model-probe.ts) ждёт запуска в
  игре; в данные юнитов модели войдут после неё.
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
- `ChangeLevel` (через `CustomVictoryBJ`) из наших карт роняет и 3.0, и 1.31 — вне кампании, как при
  `-loadfile`, так и при запуске из меню «Сражения»; цель (наша или чужая карта, фон загрузки −1/0/57)
  не влияет. Внутри настоящей `.w3n` проверка ждёт ручного клика по кнопке миссии
  (`TODO(changelevel)`).
- `PlayCinematic` с импортированным `.bik` ничего не показывает; `blizzard.j` 3.0 вызывает его только с
  встроенными именами (`"HumanOp"`, `"OrcEd"`), так что импортные ролики почти наверняка не поддерживаются.
