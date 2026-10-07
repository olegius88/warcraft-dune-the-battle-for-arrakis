# types — объявления для пакетов без своих типов

| Файл | Что описывает |
|---|---|
| `gifenc.d.ts` | `gifenc` 1.0.3 (сборка GIF в `tools/make-gif.ts`): только используемая часть API, по README пакета. |

Пакет CommonJS без распознаваемых именованных экспортов, поэтому под ESM работает только импорт по
умолчанию: `import gifenc from 'gifenc'; const { GIFEncoder } = gifenc;`.
