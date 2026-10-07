# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [Unreleased]

### Added
- 2026-10-07 Генераторы форматов WC3 без World Editor: MPQ v0, `war3map.w3i` v31, `.w3e` v11, `.wpm`,
  `.shd`, `.doo`/`Units.doo`, `.mmp`, `.wts`, `war3campaign.w3f` v1, BLP1-миникарта, обвязка JASS
  ([src/wc3/](src/wc3/README.md)).
- 2026-10-07 Тесты `node --test`: наши файлы читаются независимым читателем mdx-m3-viewer
  ([test/](test/)).
- 2026-10-07 Дымовой тест — две карты + кампания `DuneSmoke.w3n` ([src/smoke/build-smoke.js](src/smoke/build-smoke.js)).
  Проверено в клиенте 3.0.0.24268: карты грузятся, рельеф/обрыв/юниты на месте, JASS выполняется,
  лог через `PreloadGenEnd` пишется, game cache сохраняется между запусками (карта 2 прочитала 42).
- 2026-10-07 Запуск игры для тестов без пароля и без захвата мыши ([tools/](tools/README.md));
  в `Battle.net.config` добавлен `AdditionalLaunchArguments` для W3 (с разрешения пользователя,
  бэкап `Battle.net.config.bak-warcraft-dune`).

- 2026-10-07 Извлечение данных Emperor из установленной игры: архивы RFH/RFD, строковые таблицы
  UTF-16 (русская локализация пользователя) ([src/emperor/](src/emperor/README.md)).
- 2026-10-07 Декомпилятор скриптов миссий `.tok` (формат восстановлен: таблица токенов из `Game.exe`,
  типы объектов из `Rules.txt`, сообщения/подсказки из строковых таблиц). Все 228 скриптов
  декомпилируются без нерешённых ссылок ([src/emperor/tok.js](src/emperor/tok.js),
  тесты [test/emperor-tok.test.js](test/emperor-tok.test.js)).

- 2026-10-07 Разбор карт Emperor: `test.xbf` мета-записи, включая расшифрованное дерево точек
  `GameElements` (базы, точки скриптов, входы с номерами соседних территорий)
  ([src/emperor/mapxbf.js](src/emperor/mapxbf.js)).

- 2026-10-07 Основной клиент для разработки — классический 1.31.1 (`G:\Games\Warcraft III`): запускается
  без входа в Battle.net, `w3i` по умолчанию v28 (как у редактора 1.31.1), v31 — опционально
  ([src/wc3/formats.js](src/wc3/formats.js), [tools/run-wc3-classic.ps1](tools/run-wc3-classic.ps1)).
- 2026-10-07 Кампания `.w3n` всегда содержит `war3campaign.wts/.imp/.w3u/.w3t/.w3b/.w3d/.w3a/.w3h/.w3q`
  (пустые, если нечего класть): без них 1.31 не показывает кампанию в списке. Карта всегда содержит
  `war3map.wts/.w3r/.w3c/.w3s/.imp` и пустые объектные файлы.

- 2026-10-07 Перенос миссий Emperor в WC3:
  - рельеф карт по типам тайлов (песок/скала/обрывы/рампы, проходимость, строить только на скале)
    ([src/emperor/terrain.js](src/emperor/terrain.js));
  - юниты и здания из `Rules.txt` → данные объектов WC3 на стандартных моделях, таблица урона из
    боеголовок Emperor, тех-требования, харвестеры/поля специи/строители на родных механиках WC3
    ([src/emperor/rules.js](src/emperor/rules.js), [src/emperor/units.js](src/emperor/units.js),
    [src/wc3/objects.js](src/wc3/objects.js));
  - транслятор скриптов миссий в JASS (все 228 проходят `pjass` 1.31.1) и библиотека API Emperor
    на JASS ([src/emperor/translate.js](src/emperor/translate.js), [src/emperor/runtime.js](src/emperor/runtime.js));
  - территориальный бой: поля специи, стартовые силы, база противника, производство и волны
    ([src/emperor/battle.js](src/emperor/battle.js), [src/emperor/mission.js](src/emperor/mission.js)).
  Проверено в 1.31.1: ATStart (стартовая миссия Атрейдесов) и ATP1M11OR на T11 запускаются и идут.
- 2026-10-07 Запуск игры в фоне: окно уходит под окна пользователя, фокус возвращается, снимок окна
  через `PrintWindow`, отладочный отчёт миссии в `CustomMapData\DuneTest`
  ([tools/wc3-window.ps1](tools/wc3-window.ps1)).

- 2026-10-07 Полная кампания `build/campaign/EmperorDune.w3n` (211 карт, все проходят `pjass`):
  кнопки «Обучение» и трёх домов, стартовые миссии, хаб «Арракис» с выбором атак, фазами, тех-уровнями
  и ответными атаками, бои за территории (атака и оборона волнами), сюжетные миссии (хайлайнер,
  оборона и штурм родных миров, финал), передача состояния через game cache
  ([src/emperor/campaign-data.js](src/emperor/campaign-data.js), [src/emperor/hub.js](src/emperor/hub.js),
  [src/emperor/build-campaign.js](src/emperor/build-campaign.js)).
- 2026-10-07 Размещённые на картах объекты: базы и войска сюжетных карт (владелец 1 — противник,
  0 — игрок), деревья, дома, бочки, обломки ([src/emperor/mission.js](src/emperor/mission.js)).
- 2026-10-07 Ящики дают подарок из `Rules.txt` (`CrateGiftObject`: сардаукары, инфильтраторы, лич,
  контаминатор, `CASH2000`) юниту, который к ним подъехал ([src/emperor/rules.js](src/emperor/rules.js),
  [src/emperor/mission.js](src/emperor/mission.js), тест [test/emperor-mission.test.js](test/emperor-mission.test.js)).
- 2026-10-07 Ветеранство из `Rules.txt`: убийца получает `Score` жертвы, на порогах `VeterancyLevel`
  юнит получает здоровье, урон, броню, дальность, скорость, саморемонт, знак элиты
  ([src/emperor/rules.js](src/emperor/rules.js), [src/emperor/mission.js](src/emperor/mission.js)).
  В игре ещё не проверялось.
- 2026-10-07 Оригинальная озвучка сообщений миссий: `DATA\Sounds\sounds.txt` связывает ключ сообщения
  с репликой `DIALOG.BAG`, карта импортирует только свои реплики, `Message()` ставит их в очередь
  (по одной, по известной длительности). Проверено в 1.31.1: IMA ADPCM WAV и MP3 открываются движком
  ([src/emperor/bag.js](src/emperor/bag.js), [src/emperor/speech.js](src/emperor/speech.js),
  [src/emperor/runtime.js](src/emperor/runtime.js)).
- 2026-10-07 Тестовые прогоны пишут JPEG и GIF игрового окна для показа в чате
  ([tools/test-maps.ps1](tools/test-maps.ps1), [tools/make-gif.js](tools/make-gif.js); devDependencies `gifenc`, `pngjs`).

### Fixed
- 2026-10-07 Сюжетные миссии хайлайнера сразу заканчивались «Победой»: фрегаты-фабрики противника
  отбрасывались как декорация, а условие победы скрипта — «у врага не осталось фрегатов»
  ([src/emperor/mission.js](src/emperor/mission.js), регрессия [test/emperor-mission.test.js](test/emperor-mission.test.js)).
- 2026-10-07 На сюжетных картах камера стартовала в пустом углу: если ни скрипт, ни бой камеру не
  ставят, она центрируется на войсках игрока (регрессия в том же файле).
- 2026-10-07 Ящики были предметами WC3 `gold` и все давали одно и то же; у юнитов Emperor нет
  способности «Инвентарь», так что подобрать их, вероятно, было нечем (в игре не проверялось).
  Теперь подбор — проверка расстояния раз в 0,5 с ([src/emperor/mission.js](src/emperor/mission.js)).
- 2026-10-07 Игра при тестовом запуске захватывала мышь (ограничивала курсор своим окном в конце
  загрузки, даже в фоне): сторож в [tools/run-wc3-classic.ps1](tools/run-wc3-classic.ps1) снимает
  ограничение за ≤30 мс и возвращает фокус ([tools/README.md](tools/README.md)).
- 2026-10-07 `real()` округлял до 0.1: таймер тика Emperor (0.04 с) превращался в 0.0 и скрипты миссий
  выполнялись тысячи раз в секунду ([src/wc3/jass.js](src/wc3/jass.js), регрессия
  [test/jass.test.js](test/jass.test.js)).
- 2026-10-07 Падение клиента 3.0 (`0xC0000005`) при загрузке и превью наших карт: не хватало
  `war3mapMap.blp`. Теперь миникарта генерируется всегда ([src/wc3/map.js](src/wc3/map.js),
  регрессия [test/wc3-map.test.js](test/wc3-map.test.js)).

### Known issues
- `ChangeLevel` (через `CustomVictoryBJ`) из наших карт роняет и 3.0, и 1.31 — вне кампании, как при
  `-loadfile`, так и при запуске из меню «Сражения»; цель (наша или чужая карта, фон загрузки −1/0/57)
  не влияет. Внутри настоящей `.w3n` проверка ждёт ручного клика по кнопке миссии
  (`TODO(changelevel)`).
- `PlayCinematic` с импортированным `.bik` ничего не показывает; `blizzard.j` 3.0 вызывает его только с
  встроенными именами (`"HumanOp"`, `"OrcEd"`), так что импортные ролики почти наверняка не поддерживаются.
