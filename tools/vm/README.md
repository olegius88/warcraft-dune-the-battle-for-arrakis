# tools/vm — игры в виртуальной машине на тестовом сервере

Emperor и Warcraft III гоняются в ВМ с Windows 11, а не на рабочем столе пользователя. На хосте
каждый запуск забирал фокус и мышь. Emperor вне фокуса сворачивается, а его меню не принимало
программные клики: DirectInput их не видит.

**Где:** `olegius@192.168.50.94`, каталог `/mnt/data2/_projects/dune-vm` (на сервере скрипты лежат
в `harness/`, копируются туда отсюда через `scp`).

**Откуда ВМ:**
- `dune.qcow2` — самостоятельная копия (`qemu-img convert`) подготовленного образа проекта
  puntoswitcher (`/mnt/data2/_projects/puntoswitcher/build/windows-vm/prepared.qcow2`). Это
  Windows 11 Enterprise Evaluation с автовходом и WinRM; сам образ puntoswitcher не трогается.
- `control-python` (pywinrm) и `unattend` (учётная запись) — ссылки на каталоги puntoswitcher.

**Игры внутри ВМ:** `C:\Games\Emperor` (с dgVoodoo2) и `C:\Games\Warcraft III`. Они переданы
архивами `games/*.tar` (`serve.sh` + `guest/install-game.ps1`). Ключи реестра Emperor ставит
`guest/emperor-registry.ps1`.

**Видеокарты нет** (`-vga std`): Windows рисует программно (WARP). Бой Emperor идёт медленно, но
для замеров и снимков этого хватает.

## Файлы

| Файл | Назначение |
|---|---|
| `boot.sh` | Запуск ВМ в фоне: 4 ядра, 8 ГБ, WinRM на `127.0.0.1:55986`, VNC на `127.0.0.1:5906`, QMP в `runtime/qmp.sock`. |
| `winrm_run.py` | PowerShell в ВМ через WinRM (`wait`, `ps`, `upload`, `task` — скрипт в сеансе пользователя с рабочим столом). Взят из harness puntoswitcher, отличается портом. |
| `qmp.sh` | Одна команда QMP (`screendump`, `system_powerdown`, ...). |
| `shot.sh` | Снимок экрана ВМ в PNG (QMP `screendump`). |
| `input.sh` | Мышь и клавиатура через QMP `input-send-event`: `click`, `rclick`, `ctrlclick`, `goto`, `key`, `rel`, `move`. |
| `locate.py` | Поиск курсора Emperor на снимке по шаблону (`emperor-cursor*.json`); нужен для `input.sh`. |
| `frames.sh` | Быстрая серия кадров (до ~10 в секунду, одна сессия QMP) для эффектов. |
| `watch.sh` | Долгое наблюдение за областью экрана, например полосой сообщений: кадр раз в N секунд, сохраняется только изменившийся. |
| `sheet.py` | Контактный лист серии кадров (с вырезом области). |
| `serve.sh` | HTTP-раздача каталога ВМ только на `127.0.0.1:8770`; из ВМ это адрес `10.0.2.2`. |
| `guest/*.ps1` | Скрипты, исполняемые внутри ВМ: установка игры, реестр Emperor, запуск Emperor. |

## Нюансы (проверено 2026-10-08)

- **Ввод.** Курсор Emperor движется только от относительных шагов мыши (PS/2). Абсолютная позиция
  USB-планшета его не двигает. Поэтому `input.sh` шагает мелкими шагами (крупные ускоряются):
  - **в меню:** сначала загоняет курсор в левый верхний угол, затем идёт к цели;
  - **в бою** (`GAME=1`) угол прокрутил бы карту, поэтому курсор ищется по снимку (`locate.py`) и
    доводится за несколько итераций;
  - **курсор не опознан** (с выделенными юнитами это курсор приказа): шаг идёт от последнего
    известного положения `runtime/cursor.pos`.
- **Края экрана.** Цели держать в 30 px от краёв: в бою там прокрутка.
- **Масштаб шага.** Меню (800×600, растянуто на 1280×800): 2,35 × 1,98 px на единицу шага; бой:
  около 2,54 × 2,39.
- **Шаблоны курсора.** `emperor-cursor.json` снят с кадра меню (остриё в 465,387),
  `emperor-cursor-game.json` — с кадра боя (остриё в 750,443). Пересоздать:
  `locate.py make <кадр> <x> <y> <out.json>`.
- **WinRM запускает Windows PowerShell 5.1.** Конвейер между программами там идёт как текст и
  накапливается в памяти: на 2-ГБ tar ушло 4 ГБ ОЗУ, распаковка не началась. Поэтому файлы сначала
  сохраняются (`curl -o`), потом распаковываются.
- **Разовый `screendump`** через новую сессию QMP занимает около 1 с; в одной сессии — около
  0,1 с (`frames.sh`).
- **Warcraft III в ВМ не рисует.** CD-ключ введён (2026-10-08), клиент 1.31.1 запускается, но без
  видеокарты (`-vga std`) окно остаётся чёрным и с Direct3D9, и с `-graphicsapi OpenGL2`;
  Direct3D11 в 1.31 падает. Пробы WC3 идут на хосте (`tools/run-wc3-classic.ps1`).
- **Удалённый рабочий стол.** В ВМ включён RDP; QEMU пробрасывает его на `127.0.0.1:53389` сервера
  (QMP `human-monitor-command` `hostfwd_add net0 tcp:127.0.0.1:53389-:3389`, живёт до перезапуска
  ВМ), с рабочей машины — SSH-туннелем: `ssh -N -L 53389:127.0.0.1:53389 olegius@192.168.50.94`,
  затем `mstsc /v:localhost:53389`, пользователь `.\keyswitch`. `ForceAutoLogon` выключен (иначе
  консоль сразу забирала сеанс у RDP); после выхода из RDP сеанс вернуть на консоль, иначе игры
  в нём не запускаются: `tscon <id> /dest:console` (id из `query user`).
- **Ознакомительная лицензия** Windows истекает примерно через 48 дней от 2026-10-08.
  Продлевается до трёх раз через `slmgr /rearm` (см. `harness/PREPARED.md` puntoswitcher).

## Пример

```bash
cd /mnt/data2/_projects/dune-vm
harness/boot.sh && python3 harness/winrm_run.py wait 600
python3 harness/winrm_run.py task DuneEmperor 'C:\Dune\start-emperor.ps1'
harness/input.sh key esc               # пропустить ролик
harness/input.sh click 645 545         # «Простая игра»
GAME=1 harness/input.sh click 640 400  # в бою
harness/frames.sh runtime/fx 10 0.1 && python3 harness/sheet.py runtime/fx runtime/fx.png
harness/qmp.sh system_powerdown
```
