# dsh-peak-indicator — документация на русском

> English version: [README.md](README.md). Эта страница — полный русский
> вариант; при расхождениях исходным считайте английский README и код.

Клиентский плагин для веб-интерфейса **DeepSeek Harness (DSH)**: компактная капсула
**⚡ Пик / 🌙 Непик** в шапке сессии с обратным отсчётом до смены тарифа.

Расчёт идёт строго по **пекинскому времени (`Asia/Shanghai`, UTC+8)** с учётом
**официальных праздников КНР** и **перенесённых рабочих дней (调休上班)**.
Плагин клиентский: ни одного сетевого запроса, вся арифметика локальная.

```
⚡ Пик · до скидки 1ч 30м          🌙 Непик · через 04:32 пик
```

- Красный `#e5484d` — действует полный тариф.
- Зелёный `#30a46c` — действует скидка 50 %.
- Меньше часа до переключения — отсчёт с секундами (`MM:SS`), иначе `Xч Yм`.
- Подсказка при наведении: текущее пекинское время, сработавшее правило, точное
  время следующего переключения и полный текст правил тарификации.
- Сессии не-DeepSeek: индикатор **не отображается**.

---

## 1. Быстрый старт

```bash
npm install          # нужен .npmrc с legacy-peer-deps (альфа-линия DSH конфликтует по cordis)
npm test             # собирает обе половины и прогоняет 88 тестов
npm run demo         # собирает dist/demo.html и печатает контрольный рендер
npm run build        # typecheck → tsc (lib/types: JS + .d.ts) → tsdown (lib/client.js)
npm run verify       # всё сразу: typecheck, сборка, тесты, демо
```

Требования: **Node 20+** для тестов; `tsdown` закреплён на `0.22.2`, потому что
`0.22.14+` требует Node 22 (`Promise.withResolvers`).

---

## 2. Важное расхождение с ТЗ: реальный API DSH

ТЗ описывало SDK с `definePlugin` и слотом `conversation.session.header.actions`.
В реальном DSH (проверено по `deepseek-ai/deepseek-harness`, линия **0.2.1-alpha.2**)
API другой — это **Cordis**, и `definePlugin` в нём нет:

| Что в ТЗ | Как в DSH на самом деле |
|---|---|
| `definePlugin({...})` | плагин = объект/модуль с `export const inject` и `export function apply(ctx)` |
| слот `conversation.session.header.actions`, `order: -20` | оба места существуют: `conversation.session.header.actions` (рядом с заголовком, слева) и **`conversation.session.header.utilities`** (справа, рядом с экспортом журнала сессии) |
| «CSS-модули DSH» | в монорепозитории — `*.module.css` через общий пресет `clientBundle()`; в отдельном пакете CSS-модуль уезжает в `lib/style.css`, который лоадер не подхватывает, поэтому здесь стили инлайнятся тегом `<style>` (ТЗ это разрешает) |

Плагин регистрируется в **`conversation.session.header.utilities`** с `order: -20`
(справа, левее кнопки журнала сессии, у которой `order` по умолчанию), как и просит
основной вариант ТЗ. Для справки: ряд `utilities` сортируется по возрастанию
`order`, и штатные соседи занимают `-10`
(`dsh-client-ui-open-in-app`) и `0` по умолчанию (`dsh-session-log-export` — та
самая выгрузка журнала сессии), поэтому `-20` ставит капсулу первой слева в
правой группе.
Альтернативный вариант ТЗ включается конфигом:

```js
globalThis.__DSH_PEAK_INDICATOR_CONFIG__ = { slot: 'conversation.session.header.actions' }
```

Регистрация (фактический код, `src/client/index.ts`):

```ts
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'peak-indicator',
    order: -20,
  }, HeaderUtility))
}
```

`ctx.slots.inject(...)` обязателен: место принадлежит `ui-conversation`, и вкладываться
в чужой слот нужно через `inject`, чтобы запись жила вместе с объявлением владельца.

---

## 3. Правила тарификации

Источник: [Models & Pricing — DeepSeek API](https://api-docs.deepseek.com/zh-cn/quick_start/pricing):
«北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00 为高峰时段；
其余时段，包括周末及中国法定节假日全天均为空闲时段»; 空闲时段 = 50 % от 高峰时段.

Порядок проверки зафиксирован в `src/pricing.ts` и **не может быть переставлен**:

1. дата есть в `CN_HOLIDAYS` → **непик весь день** (час игнорируется);
2. дата есть в `CN_MAKEUP_WORKDAYS` → день трактуется как **будни** (даже если это сб/вс);
3. иначе ISO-день недели 6 или 7 → **непик весь день**;
4. иначе (будни) → час в `09:00–12:00` или `14:00–18:00` → **пик**, иначе **непик**.

Границы окон: начало включительно, конец исключительно (`12:00:00.000` — уже непик).

### Календарь КНР

Данные 2026 года взяты из **国务院办公厅关于2026年部分节假日安排的通知,
国办发明电〔2025〕7号 от 2025-11-04** и сверены с публикацией в 国务院公报
(2025 年 第 32 号): 33 дня праздников и 6 перенесённых рабочих дней
(01-04, 02-14, 02-28, 05-09, 09-20, 10-10).

**2027 год намеренно пустой** (`CN_HOLIDAYS_2027 = []`): уведомление Госсовета
обычно выходит в ноябре, и выдумывать даты нельзя. Пока год не покрыт:

- `calendarCoverage()` возвращает `covered: false`;
- капсула получает пунктирную рамку (класс `dshpi-stale`);
- в подсказке появляется строка `⚠ Календарь праздников КНР загружен только для 2026…`.

Чтобы добавить год, достаточно дописать две константы и одну строку в
`HOLIDAY_CALENDAR` — больше ничего менять не нужно (см. комментарий в `src/holidays.ts`).

---

## 4. Как определяется «сессия DeepSeek»

Сессия в DSH хранит прочный маршрут модели в проекции `modelSelection`
(`{ lastUsed, next }`, каждый — `{ provider, model }`). Компонент читает её
штатным хуком `useProjection('modelSelection', selector)`; никаких сервисов и
запросов.

- Штатные id провайдеров DeepSeek: `deepseek-account` (аккаунт DeepSeek) и
  `deepseek-official` (провайдер по API-ключу).
- Пользовательский провайдер может называться как угодно, поэтому вторым
  признаком работает префикс модели (`deepseek-*`) — так капсула остаётся у
  сессии, которая идёт в DeepSeek через `openrouter`-подобный маршрут.
- `next` важнее `lastUsed`: если пользователь только что переключился на другую
  модель, индикатор гаснет сразу, а не «по истории».
- Проекции нет вовсе (capability absent) → индикатор скрыт.

Пороги настраиваются (`providerIds`, `providerPrefixes`, `modelPrefixes`,
`showWhenUnknown`) — см. раздел 6.

---

## 5. Обновление и отсчёт

- Опроса нет вообще: капсула просыпается **ровно в те моменты, когда может
  измениться отображаемая цифра**. В минутном режиме — раз в минуту, на границе
  wall-минуты; в секундном (осталось меньше часа) — раз в секунду, на границе
  секунды.
- Все границы тарифа (09:00, 12:00, 14:00, 18:00, полночь) лежат на минутных
  границах, поэтому то же пробуждение переключает фазу **с нулевой задержкой** —
  без «в течение 30/60 секунд» лага опроса.
- Каждое пробуждение пересчитывает состояние от `Date.now()`, цепочка
  самовосстанавливается после скачка системных часов; просроченное пробуждение
  срабатывает при выходе из сна, а `visibilitychange` мгновенно ресинхронизирует
  капсулу при возврате во вкладку.
- Фоновая вкладка не рендерит, но цепочку держит; браузер сам ограничивает
  цепочки setTimeout'ов минимумом в 1 раз/мин.
- Против исходных 30 с из ТЗ: вдвое меньше пробуждений, точная минута вместо
  «отстающей на период опроса», точное переключение. Поведение закреплено
  `tests/timer.spec.ts` (см. раздел 8).

---

## 6. Конфигурация

Плагин читает глобальную переменную (тот же приём, что использует штатный
`dsh-client-ui-sidebar-documentpreview`), поэтому конфигурация не требует ни
сервисов, ни сети:

```js
// до загрузки бандла плагина
globalThis.__DSH_PEAK_INDICATOR_CONFIG__ = {
  providerIds: ['deepseek-account', 'deepseek-official', 'my-deepseek-proxy'],
  providerPrefixes: ['deepseek'],
  modelPrefixes: ['deepseek-'],
  showWhenUnknown: false,             // показывать ли капсулу до первого запроса модели
  language: undefined,                // 'ru' | 'en'; undefined = по navigator.language
  slot: 'conversation.session.header.utilities',
  order: -20,
}
```

Все поля опциональны; мусорные значения отбрасываются в пользу умолчаний
(`normalizeConfig` покрыт тестами).

Язык подписей: по умолчанию русские строки из ТЗ, для `en*`-браузера —
английские. Строки живут в `src/strings.ts`. Чтобы вместо этого идти за
языковой настройкой DSH, зарегистрируйте словарь в `ctx.locale` и объявите
`locale: NS` в регистрации слота — тогда компонент получит штатный `t`
(в монорепозитории это предпочтительный путь; браузерный клиент DSH ship'ит
только `zh` и `en`, поэтому русский словарь пришлось бы ставить отдельным
language pack).

---

## 7. Структура

```
dsh-peak-indicator/
├── package.json             # dsh.bundle.patch + dsh.client { platform: web }, экспорт ./client
├── cordis.patch.yml         # слой профиля: одна строка Loader { id, name }
├── locale/{en,ru,zh}.json   # название и описание для Settings → Plugins
├── tsconfig.json            # браузерная программа (src), строгость как в DSH
├── tsconfig.build.json      # эмиссия lib/types
├── tsconfig.test.json       # программа тестов (node-типы)
├── tsdown.config.ts         # бандл lib/client.js + обёртка __ModuleLoader__.load
├── vitest.config.ts         # TZ=Pacific/Kiritimati (UTC+14) — назло локальной зоне
├── src/
│   ├── index.ts             # Node-половина: пустой apply() + чистая логика тарифа
│   ├── beijing.ts           # Asia/Shanghai: Intl-разбор, обратный перевод, календарь
│   ├── holidays.ts          # CN_HOLIDAYS_2026 / CN_MAKEUP_WORKDAYS_2026 (+2027)
│   ├── pricing.ts           # чистая функция getPricingState(date) + переходы
│   ├── strings.ts           # подписи капсулы и подсказки (ru/en), формат отсчёта
│   ├── provider.ts          # «эта сессия — DeepSeek?»
│   ├── config.ts            # нормализация конфигурации
│   └── client/
│       ├── index.ts         # браузерная половина: inject + apply, регистрация в слоте
│       ├── PeakIndicator.tsx# React-капсула (хуки, отсчёт, tooltip)
│       └── styles.ts        # инлайн-стили + инжект тега <style>
├── tests/
│   ├── pricing.spec.ts      # 31 тест: все обязательные случаи + развёртка недели
│   ├── strings.spec.ts      # 14 тестов: подписи, отсчёт, подсказка
│   ├── provider.spec.ts     # 12 тестов: определение DeepSeek-сессии
│   ├── config.spec.ts       # 8 тестов: нормализация конфигурации
│   ├── bundle.spec.ts       # 8 тестов: собранный lib/client.js под фейковым лоадером
│   ├── install.spec.ts      # 12 тестов: контракт с хостом DSH (exports, dsh.*, патч, артефакты)
│   └── timer.spec.ts        # 3 теста: живость отсчёта на смонтированном компоненте (30 с / 1 с)
├── demo/                    # автономный предпросмотр (dist/demo.html)
└── tools/verify-demo.mjs    # контрольный рендер демо в happy-dom
```

Отличия от структуры в ТЗ — осознанные: `beijing.ts`/`strings.ts`/`provider.ts`/
`config.ts` вынесены, чтобы чистая логика тестировалась без React и DOM, а
`Indicator.tsx` + `index.ts` стали `client/PeakIndicator.tsx` + `client/index.ts`,
как устроен любой клиентский пакет DSH (`src/client/index.ts` → `lib/client.js`).

---

## 8. Тесты

88 тестов, `npm test` (скрипт сам пересобирает бандл, потому что
`tests/bundle.spec.ts` проверяет собранный артефакт; `npm run test:unit` — то же
без пересборки). Обязательные случаи из ТЗ:

| Случай | Где |
|---|---|
| обычный будний пиковый час | `pricing.spec.ts` → *ordinary weekday, peak hour* |
| обычный будний непиковый час | *ordinary weekday, off-peak hour* |
| суббота | *Saturday* |
| воскресенье | *Sunday* |
| праздник, приходящийся на будний день | *statutory holiday falling on a weekday, inside a peak window* |
| перенесённая рабочая суббота | *make-up workday Saturday follows the weekday rule* |

Дополнительно: границы окон с точностью до миллисекунды; переход через полночь в
праздник; мост через праздничную серию, заканчивающуюся выходными; пятница 18:00 →
понедельник 09:00; переход года; **поминутная развёртка всей недели** (каждая минута:
следующее переключение в будущем, меняет фазу и попадает ровно на границу тарифа);
целостность таблиц КНР (переносы только на сб/вс и никогда не на праздник);
русские и английские подписи; определение провайдера; нормализация конфига.

Тесты идут при `TZ=Pacific/Kiritimati` (UTC+14) и отдельно проверяют, что локальная
дата в этот момент другая, — пройти «случайно» за счёт часового пояса машины они не
могут.

`tests/bundle.spec.ts` прогоняет **собранный артефакт**: выполняет `lib/client.js`
через `window.__ModuleLoader__.load({ id, factory })`, материализует фабрику
фейковой модульной таблицей (react, react/jsx-runtime, ui-primitives), вызывает
`apply()` на подставном `ctx` и рендерит зарегистрированный компонент
`react-test-renderer`ом — то есть проверяет не только логику, но и форму плагина:
`inject === ['slots']`, регистрация в `conversation.session.header.utilities`
с `id: 'peak-indicator'` и `order: -20`, `null` для не-DeepSeek сессии и корректный
текст/`data-phase`/`data-rule`/tooltip для DeepSeek-сессии.

Отдельный spec, `timer.spec.ts`, держит смонтированный компонент под фейковыми
таймерами и требует, чтобы подпись двигалась ровно по границам отображаемых цифр:
ни одного пробуждения между минутными границами, раз в минуту в минутном
режиме, раз в секунду в секундном, переключение фазы на границе с нулевой
задержкой и без перемонтирования. Это регрессия на «замороженный» отсчёт: был случай, когда
подпись вычитала остановившиеся быстрые часы и тем отменяла каждое медленное
обновление.

---

## 9. Установка в DSH

### 9.1 Что DSH требует от устанавливаемого плагина

Установка в DSH устроена вокруг **бандла**: это npm-пакет, который объявляет
`dsh.bundle.patch` — YAML-слой конфигурации, добавляющий строки в загрузочный
граф профиля. Без этого поля менеджер плагинов отказывает с ошибкой
`not-bundle` («这个包没有声明组合包» / «package does not declare a bundle»), даже
если пакет — валидный клиентский плагин. Поэтому в `package.json` объявлены оба
поля:

```json
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  }
}
```

- `dsh.bundle.patch` → слой, который вставляет одну строку Loader:
  ```yaml
  - insert:
      - id: peak-indicator
        name: dsh-peak-indicator
  ```
- `dsh.client.platform: "web"` → по этой декларации хостовая половина
  `dsh-client-modules` берёт `lib/client.js`, добавляет его в `window.__DSH_BOOT__`
  и отдаёт под `/plugins`. `config` и `inject` в строке не нужны: опции плагин
  читает из `globalThis.__DSH_PEAK_INDICATOR_CONFIG__`, а единственная зависимость
  от сервисов Cordis (`slots`) объявлена в самом плагине.

### 9.1.1 Пакет обязан иметь обе половины (это ломало загрузку)

Строка Loader ссылается на **имя пакета**, и хост импортирует его в Node-процессе.
Отсюда два независимых требования, без любого из которых DSH не стартует:

1. **Корневой экспорт `"."`** в `package.json` → `lib/index.js`. Без него загрузка
   профиля падает ещё до браузера:
   ```
   Error: dsh: plugin tree failed to load: failed to import loader entry
   peak-indicator (dsh-peak-indicator): No "exports" main defined in
   …/profiles/web/node_modules/dsh-peak-indicator/package.json
   Error [ERR_PACKAGE_PATH_NOT_EXPORTED]
   ```
2. **Корневой модуль обязан быть валидным плагином Cordis**: `ctx.registry.plugin()`
   бросает `invalid plugin, expect function or object with an "apply" method`
   для любого другого экспорта. Поэтому `src/index.ts` несёт пустой `apply()` —
   ровно так устроены штатные чисто-клиентские пакеты DSH
   (`dsh-client-ui-open-in-app`, `dsh-client-ui-session`: «Pure UI plugin: the
   empty apply exists so the plugin appears in the host cordis.yml / Loader; the
   browser half ships via exports["./client"]»). Никакого `inject` у Node-половины
   нет, так что строка не ждёт сервисов, которых в хосте может не оказаться.

Браузерная половина при этом живёт в `exports["./client"]` → `lib/client.js`:
её резолвит `dsh-client-modules` по декларации `dsh.client`
(`clientExportOf(pkgName, pkg.exports)`), и именно она регистрирует фабрику
`window.__ModuleLoader__.load({ id: 'dsh-peak-indicator', factory })`.

Плюс к этому корневой модуль реэкспортирует чистую логику тарифа
(`getPricingState`, `isPeak`, таблицы праздников), так что Node-половина
не бесполезная заглушка: её можно импортировать в тестах, скриптах и SDK-сборках.

Проверено стендом, который повторяет действия хоста по шагам: установка
`npm pack`-тарбола в пустой профиль → `require.resolve('dsh-peak-indicator')` и
вызов `apply()` → резолв `./client` → выполнение бандла с фейковым
`window.__ModuleLoader__` → разбор `cordis.patch.yml` → чтение `locale/*.json`
(все пять шагов зелёные). Те же инварианты закреплены в `tests/install.spec.ts`,
поэтому регрессия ловится до установки.

Второе, за чем смотрит DSH при установке, — **совместимость**: любые
`peerDependencies` вида `@deepseek-ai/dsh*` сверяются с версией запущенного DSH
(`includePrerelease: true`). Несовпадение = отказ `incompatible-version`. Поэтому
диапазоны здесь широкие и покрывают обе текущие линии (`0.2.0-rc.2` с
`cordis ~4.0.4` и `0.2.1-alpha.2` с `cordis ~4.0.5-alpha.1`):

```json
"peerDependencies": {
  "@deepseek-ai/cordis": ">=4.0.4 <5.0.0-0",
  "@deepseek-ai/dsh": ">=0.2.0-rc.1 <0.3.0-0",
  "@deepseek-ai/dsh-client-ui-primitives": ">=0.0.1-0 <0.3.0-0"
}
```

### 9.2 Способ A — через веб-интерфейс (Settings → Plugins → Add plugin)

Поле установки принимает имя npm-пакета, git-репозиторий или **локальный путь**.
Локально — самый короткий путь:

```bash
cd dsh-peak-indicator
npm install
npm run build          # lib/client.js + lib/types — обязательны, DSH не собирает плагин
npm pack               # → dsh-peak-indicator-0.1.1.tgz
```

Затем в DSH: **Settings → Plugins → Add plugin** и один из вариантов в поле
«包名或地址 / package name or address»:

| Источник | Что вставить |
|---|---|
| локальный каталог | `/полный/путь/до/dsh-peak-indicator` |
| локальный тарбол | `/полный/путь/до/dsh-peak-indicator-0.1.1.tgz` |
| npm | `dsh-peak-indicator` (после публикации; можно выбрать зеркало npmmirror) |
| GitHub | `github:you/dsh-peak-indicator` или `git+https://…#<sha>` |

Установка идёт в профиль запущенного хоста (Desktop — профиль `desktop`,
`dsh web` — профиль `web`). После установки страница перезагружается, строка
`peak-indicator` появляется в загрузочном графе, а в списке плагинов — название и
описание из `locale/*.json`.

**Про git-установку:** git-зависимость ставится из исходников, `lib/` там нет,
поэтому в `package.json` есть `prepare: "npm run types && npm run bundle"`.
pnpm ≥ 10 не запускает `prepare` у git-зависимостей без разрешения: первая
установка упадёт, и DSH подскажет добавить в `$DSH_HOME/profiles/<профиль>/pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-peak-indicator: true
```

после чего `add` повторяют. Это разрешение выполнить чужой код на своей машине —
для чужих репозиториев фиксируйте коммит (`#<sha>`). Тарбол и npm-пакет таких
разрешений не требуют.

### 9.3 Способ B — через CLI (`dsh plugin`)

```bash
# веб-профиль
dsh plugin --profile web add /полный/путь/до/dsh-peak-indicator
dsh --profile web --dump-config      # должен появиться слой «# == dsh-peak-indicator»
dsh --profile web                    # и открыть веб-интерфейс

# Desktop: сначала один раз запустить и полностью закрыть приложение,
# чтобы профиль desktop инициализировался
dsh plugin --profile desktop add ./dsh-peak-indicator-0.1.1.tgz
```

`dsh plugin --profile <name> …` проксирует pnpm в каталоге профиля, поэтому
работают все глаголы pnpm (`add`, `remove`, `update`, `list`). Первая установка
создаёт профиль с `@deepseek-ai/dsh-base` и дописывает пакет в
`dsh.profile.bundles`.

Удаление:

```bash
dsh plugin --profile web remove dsh-peak-indicator
```

(или кнопка Uninstall в списке плагинов) — убирает и зависимость, и слой.

### 9.4 Способ C — руками в слой профиля

Если не хочется ставить пакет как зависимость профиля, достаточно двух строк в
`$DSH_HOME/profiles/<профиль>/cordis.patch.yml` (или в любом `--patch`-оверлее):

```yaml
- insert:
    - id: peak-indicator
      name: dsh-peak-indicator
```

Пакет при этом должен находиться в зоне разрешения Node этого профиля
(`dsh plugin --profile web add dsh-peak-indicator` или `link:`-зависимость в
`package.json` профиля). Слои применяются в порядке: бандлы профиля →
`cordis.patch.yml` профиля → `$DSH_HOME/cordis.patch.yml` → `--patch`, поздние
побеждают по `id`.

### 9.5 Проверка, что плагин встал

1. `dsh --profile web --dump-config` — виден слой пакета и строка `peak-indicator`.
2. В веб-интерфейсе: **Settings → Plugins** — плагин в списке, без ошибок
   синхронизации страницы.
3. В шапке сессии DeepSeek справа появилась капсула ⚡/🌙; у сессии с другим
   провайдером её нет.
4. Штатная инспекция из живой страницы (агенту или через инструмент инспекции):
   ```
   cordis_inspect_query { platform: "client", provider: "Slots", method: "listSubTree",
                          args: { root: "conversation.session.header.utilities" } }
   ```
   — в `occupants` должен быть `peak-indicator`.

### 9.6 Если не собирается / не ставится

| Симптом | Причина и лечение |
|---|---|
| `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` при старте профиля | у пакета нет корневого `"."` экспорта: хост импортирует имя пакета в Node-процессе. Должны быть `"main": "lib/index.js"`, `exports["."]` и собранный `lib/index.js` (в 0.1.1 всё на месте — пересоберите пакет и переустановите его) |
| `invalid plugin, expect function or object with an "apply" method` | корневой модуль не экспортирует `apply`; у клиентского плагина Node-половина обязана нести пустой `apply()` |
| `not-bundle` | в `package.json` нет `dsh.bundle.patch` (здесь он есть; проверяйте, что ставите именно этот пакет) |
| `incompatible-version` | `peerDependencies @deepseek-ai/dsh*` не подходит к вашей версии DSH. Либо поправьте диапазон, либо разрешите точную версию: `dsh plugin --profile web allow-version dsh-peak-indicator@0.1.1 --dsh-version <ваша версия> --accept-risk` |
| `Cannot find module …/lib/index.js` или `…/lib/client.js` | пакет поставлен из исходников без сборки: локальный каталог линкуется как есть, поэтому сначала `npm install && npm run build` в каталоге плагина; для git-источника нужен `prepare` + `allowBuilds`, а проще всего ставить тарбол (`npm pack`) |
| `Promise.withResolvers is not a function` при сборке | `tsdown` новее `0.22.2` требует Node 22; в `package.json` закреплено `0.22.2` — не обновляйте его без перехода на Node 22 |
| `ERESOLVE` при `npm install` | альфа-линия DSH конфликтует по `cordis`; в `.npmrc` пакета уже стоит `legacy-peer-deps=true` |
| Капсулы нет, хотя плагин в списке | сессия не DeepSeek (проверьте модель в композере), либо место `conversation.session.header.utilities` не объявлено в вашей сборке DSH (нужен `ui-conversation`) |

### 9.7 Сборка (что именно делает `npm run build`)

`npm run build` = `typecheck` → `tsc -p tsconfig.build.json` (пишет в `lib/types`
и JS, и `.d.ts`) → `tsdown` с **двумя** конфигурациями:

| Артефакт | Формат | Кто его читает |
|---|---|---|
| `lib/index.js` | ESM, без браузера | Cordis Loader в хост-процессе (корневой `"."` экспорт) |
| `lib/client.js` | CJS в обёртке `__ModuleLoader__.load` | `dsh-client-modules` → `/plugins` → браузер |

Как и общий пресет монорепозитория, обе половины собираются из JS-половины
`lib/types/…`, а не из `src`: относительные `.ts`-спецификаторы к этому моменту
уже переписаны, а карты `*.js.map` сквозь tsc-карты уходят обратно в
TypeScript-исходники.

`lib/client.js` — CommonJS, обёрнутый ровно так, как это делает общий пресет:

```js
window.__ModuleLoader__.load({ id: "dsh-peak-indicator", factory: (require) => { … return module.exports } });
```

Внешними остаются только модули базовой таблицы оболочки (`PLATFORM_MODULES`):
в фактическом бандле это `react`, `react/jsx-runtime` и
`@deepseek-ai/dsh-client-ui-primitives` (Tooltip). Все остальные
`@deepseek-ai/*`-импорты — `import type`, они стираются и не создают запросов к
модульной таблице (правило чистоты клиентского бандла DSH).

### 9.8 Вариант: пакет внутри монорепозитория DSH

Для вклада в сам DSH (а не для установки снаружи):

1. переложите каталог в `packages/client/peak-indicator`, имя —
   `@deepseek-ai/dsh-client-ui-peak-indicator`;
2. `tsdown.config.ts` замените на общий пресет:
   `import { clientBundle } from '../tsdown.client.ts'; export default clientBundle('@deepseek-ai/dsh-client-ui-peak-indicator', [])`;
3. `tsconfig.json` → `extends: "../../../tsconfig.base.client.json"` + проектные
   ссылки на `vendor/cordis`, `../ui-slots`, `../ui-primitives`, `../ui-session`,
   `../ui-conversation/tsconfig.client.json`, `../ui-renderer`,
   `../../api/session-controller/tsconfig.client.json`;
4. версии `@deepseek-ai/*` → `workspace:*` / `workspace:~`;
5. добавьте строку `- id: ui-peak-indicator` / `name: '@deepseek-ai/dsh-client-ui-peak-indicator'`
   в `packages/bundle/web-app/cordis.patch.yml` (рядом с `ui-open-in-app`);
6. тогда же можно вернуть стили в `*.module.css`, а строки — в `ctx.locale`
   (`locale: NS` в регистрации даёт компоненту штатный `t`), и добавить
   `README.i18n.yaml` по образцу соседних пакетов.

### 9.9 Про конфигурацию в установленном плагине

Опции читаются из `globalThis.__DSH_PEAK_INDICATOR_CONFIG__` (приём штатного
`dsh-client-ui-sidebar-documentpreview`), потому что строка Loader для
клиентского плагина не имеет `config`. Практически это значит: чтобы поменять
слот/язык/пороги без пересборки, задайте глобал до загрузки бандла (например,
через пользовательский оверлей оболочки или консоль до перезагрузки). Если нужен
нормальный `config:` в строке Loader — это вариант 9.8: в монорепозитории
объявляется `export const Config` со schemastery-схемой, и интерполяция
`!!js ctx.…` работает штатно.

---

## 10. Что намеренно НЕ сделано

- Праздники **не** вычисляются по лунному календарю — только жёсткая таблица
  (Вариант А из ТЗ).
- Локальный часовой пояс пользователя **не** участвует в расчёте: единственная
  точка входа — `Intl.DateTimeFormat` с `timeZone: 'Asia/Shanghai'` и постоянное
  смещение +08:00 (в Китае нет летнего времени с 1991 года).
- Нет ни одного сетевого запроса, кеша вне плагина, серверной половины.
- Для сессий с другим провайдером капсула не рендерится вовсе (`return null`),
  а не «прячется стилями».
- Цвет никогда не единственный носитель состояния: есть emoji, текст, `data-phase`
  и `aria-label`.

## 11. Ограничения

- Отсчёт длиннее суток показывается в часах (`166ч 30м` на длинных праздничных
  сериях) — формат `Xч Yм` из ТЗ, без дней.
- Год без таблицы трактуется как обычный (праздники неизвестны), но капсула
  помечает это пунктиром и предупреждением в подсказке.
- `Tooltip` из `ui-primitives` — единственная runtime-зависимость от UI-пакетов
  DSH; она входит в базовую таблицу оболочки, но в очень старых сборках DSH её
  может не быть — тогда замените её на `title` или собственный `HoverCard`.

## Лицензия

MIT.
