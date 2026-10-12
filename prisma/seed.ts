// Seed idempotente: upsert su campi unique → si può rilanciare (`npx prisma db seed`) senza errori né duplicati.
// `update: {}` lascia intatti i dati esistenti: rieseguire il seed non azzera i saldi dopo dei bonifici.
import { AccountStatus, AccountType, PrismaClient } from "@prisma/client";

// Script one-shot fuori dall'app: ha il proprio client e lo chiude a fine esecuzione
const prisma = new PrismaClient();

async function main() {
  const mario = await prisma.customer.upsert({
    where: { fiscalCode: "RSSMRA80A01H501U" },
    update: {},
    create: {
      fiscalCode: "RSSMRA80A01H501U",
      firstName: "Mario",
      lastName: "Rossi",
      email: "mario.rossi@example.com",
      phone: "+39 333 1234567",
    },
  });

  const giulia = await prisma.customer.upsert({
    where: { fiscalCode: "VRDGLI90B41F205Z" },
    update: {},
    create: {
      fiscalCode: "VRDGLI90B41F205Z",
      firstName: "Giulia",
      lastName: "Verdi",
      email: "giulia.verdi@example.com",
      phone: "+39 347 7654321",
    },
  });

  const accounts = [
    { iban: "IT60X0542811101000000123456", balance: "1000.00", ownerId: mario.id, type: AccountType.CHECKING, status: AccountStatus.ACTIVE },
    { iban: "IT28W8000000292100645211208", balance: "500.00", ownerId: giulia.id, type: AccountType.SAVINGS, status: AccountStatus.ACTIVE },
    { iban: "IT02A0300203280000400162854", balance: "0.00", ownerId: mario.id, type: AccountType.CHECKING, status: AccountStatus.CLOSED },
  ];

  for (const a of accounts) {
    await prisma.account.upsert({ where: { iban: a.iban }, update: {}, create: a });
  }

  console.log("Seed completato: 2 clienti, 3 conti (1000.00, 500.00, chiuso)");
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
