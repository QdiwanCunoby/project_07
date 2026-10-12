# project_07

LipariBank — **Project Work Giorno 7: Testing con Jest, Supertest e database di test isolato**.
Base: il progetto del G6 (Customer/Account/Transfer su Postgres + Prisma, auth JWT con cookie HTTP-only e RBAC).

## Avvio

```bash
npm install
npx prisma generate

# App (Postgres del G0 in bootcamp/node: docker compose up -d)
cp .env.example .env          # valorizza JWT_ACCESS_SECRET e JWT_REFRESH_SECRET
npm run dev

# Test: Postgres dedicato, dati in RAM (tmpfs)
npm run db:test:up            # docker compose -f docker-compose.test.yml up -d --wait
npm test                      # jest (worker paralleli)
npm run test:coverage         # + report e soglie di coverage
npm run test:ci               # jest --ci --coverage --runInBand
npm run db:test:down
```

## Risultato

`npm run test:coverage` → **8 suite, 63 test verdi**, soglie rispettate:

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 94.93% | 82.32% (soglia 75) | 93.08% | **95.65%** (soglia 80) |

La coverage è calcolata su **tutto** `src/` (`collectCoverageFrom`), anche sui file che nessun test importa. Fanno eccezione `index.ts`, che avvia solo il server, e le dichiarazioni di tipo.

## Esercizi

### 1 — Setup Jest + ts-jest

| File | Cosa |
|---|---|
| `jest.config.ts` | `preset: "ts-jest"`, `testEnvironment: "node"`, `testMatch: ["**/*.test.ts"]`, `coverageThreshold: { global: { branches: 75, lines: 80 } }`, `setupFiles: ["tests/setup-env.ts"]` |
| `.env.test` | Committato, con segreti **finti**. `DATABASE_URL` punta a `liparibank_test` sulla porta **5434** |
| `docker-compose.test.yml` | Postgres 16 con `tmpfs` (nessun volume, i dati spariscono al `down`) e `fsync=off` per velocità |
| `tests/setup-env.ts` | Carica `.env.test` prima di ogni file di test |
| `tsconfig.json` / `tsconfig.build.json` | Il primo copre src + test (lo usa ts-jest); il build compila solo `src/` ed esclude `*.test.ts` |

Note:
- **Porta 5434 invece di 5433**: sulla 5433 gira già il Postgres del progetto G5. Si cambia in un solo punto (`.env.test` + compose).
- **`setup-env.ts` non usa `process.loadEnvFile`**: nel sandbox di Jest `process.env` è una copia, e `loadEnvFile` scrive su quello reale del processo, invisibile ai test (lo si vede con un `TypeError: Invalid URL`). Il file viene letto con `util.parseEnv` e le variabili assegnate a mano, senza sovrascrivere quelle già presenti: in CI vince l'ambiente del job.
- **Uno schema Postgres per worker** (`test_w1`, `test_w2`, …): `"test": "jest"` lancia i file in parallelo. Con un solo schema, il `TRUNCATE` di una suite cancellerebbe i dati di un'altra a metà test. Con `--runInBand` c'è un solo worker, quindi uno schema solo.
- `ts-node` è tra le devDependencies perché Jest ne ha bisogno per leggere un `jest.config.ts`.

### 2 — Unit test AccountService (`src/modules/account/account.service.test.ts`, 8 test)

Il repository mockato è `jest.Mocked<IAccountRepository>`, iniettato nel costruttore. Tutti i test seguono lo schema AAA.
1. `getAccountById` con ID esistente → ritorna l'Account del repo.
2. `getAccountById` con ID inesistente → `NotFoundError` (404, `NOT_FOUND`).
3. `createAccount` → il repo riceve l'account con tutti i campi. Nel progetto il "save" del repository si chiama `create(dto)`, quindi l'asserzione è `expect(mockRepo.create).toHaveBeenCalledWith({...})`.
4. `deleteAccount` → `mockRepo.delete` chiamato **una volta** con l'id giusto.
In più: IBAN duplicato → `ConflictError` senza salvataggio, delete/update di id inesistente, `getAll`.

### 3 — Unit test TransferService (`src/modules/transfer/transfer.service.test.ts`, 6 test)

`PrismaClient` arriva dal costruttore. Il mock è un oggetto con `$transaction`, che esegue la callback passandole un `tx` finto (`account.findUnique/updateMany/update`).
1. Bonifico valido → `$transaction` chiamata una volta, addebito (`updateMany` condizionato a `balance >= amount`) e accredito (`update`) eseguiti, `repo.create` con `status: COMPLETED`.
2. Fondi insufficienti (`updateMany` → `count: 0`) → `ConflictError INSUFFICIENT_FUNDS`, nessun accredito, nessun Transfer salvato.
3. Conto di origine non trovato → `NotFoundError`, nessun update.
In più: destinazione non trovata, conto bloccato (`ACCOUNT_NOT_ACTIVE`), `executeFromDto`.

### 4 — Integration test Account API (`tests/integration/account.test.ts`, 9 test)

Setup come da traccia: `beforeAll` → `prisma migrate deploy` sul DB di test, `beforeEach` → `TRUNCATE` delle tabelle (più un cliente intestatario), `afterAll` → `$disconnect()`.
1. `POST /api/accounts` senza cookie → **401**.
2. `POST /api/accounts` con JWT valido e body corretto → **201**, `data.iban` presente, riga nel DB.
3. `GET /api/accounts/:id` inesistente → **404** con `error.code === "NOT_FOUND"`.
4. `DELETE /api/accounts/:id` con role `USER` → **403**, il conto resta.
In più: DELETE come ADMIN (204), GET lista e dettaglio, PUT 200/404, POST 409 (IBAN duplicato e FK) e 422, DELETE di un conto con bonifici → 409.

Helper `tests/helpers/auth.ts`: `generateTestToken(userId, role)` firma il JWT con `JWT_ACCESS_SECRET` di `.env.test`. `authCookie(userId, role)` lo restituisce pronto per `.set("Cookie", …)`.
`tests/helpers/db.ts`: `migrateTestDatabase()` e `truncateAll(prisma)`. Quest'ultimo **rifiuta** di girare se il database connesso non ha `test` nel nome.

### 5 — Bonifico end-to-end (`tests/integration/transfer.test.ts`, 6 test)

Seed: 2 conti (1000 e 500) e un utente ADMIN.
1. `POST /api/transfers` valido (100) → **201**, saldi **900 e 600**, Transfer `COMPLETED` registrato.
2. `amount` > saldo → **409 `INSUFFICIENT_FUNDS`**, saldi **invariati**, nessun Transfer.
3. **Verifica reale del rollback**. Nel caso 2 l'`UPDATE` condizionata non modifica nessuna riga, quindi non c'è niente da annullare. Per provare il ROLLBACK di Prisma faccio fallire l'ultimo passo della transazione (`jest.spyOn(PrismaTransferRepository.prototype, "create")`) **dopo** che addebito e accredito sono già stati scritti: risposta 500 e saldi ancora 1000/500.
In più: trasferimento dell'intero saldo, conto inesistente (404), stesso conto (422), senza login (401), conto chiuso (409).

### 6 — Script

```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage",
"test:ci": "jest --ci --coverage --runInBand"
```

## Altri test

| Suite | Cosa |
|---|---|
| `tests/integration/customer.test.ts` | CRUD clienti su Postgres: unicità di codice fiscale (service) ed email (vincolo DB P2002), RBAC sul DELETE, cliente con conti → 409 |
| `tests/integration/http.test.ts` | Health check, 404 catch-all, JSON malformato → 400, body > 100kb → 413, header helmet. L'`X-Request-Id` del client viene **ignorato**: l'id di correlazione dei log lo genera sempre il server |
| `tests/integration/auth.test.ts` | Test del G6 (auth, cookie, refresh rotation, RBAC) portati da Vitest a Jest |
| `tests/unit/inMemoryRepositories.test.ts` | I repository in memoria (test double della suite auth) si comportano come quelli Prisma |

## Struttura

```
src/modules/account/account.service.test.ts     unit (accanto al codice)
src/modules/transfer/transfer.service.test.ts   unit
tests/unit/                                      unit sui test double
tests/integration/                               Supertest + Postgres di test
tests/helpers/auth.ts                            generateTestToken / authCookie
tests/helpers/db.ts                              migrateTestDatabase / truncateAll
tests/setup-env.ts                               .env.test + schema per worker
```
