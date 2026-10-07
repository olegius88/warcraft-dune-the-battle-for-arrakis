# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [Unreleased]

### Added
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
