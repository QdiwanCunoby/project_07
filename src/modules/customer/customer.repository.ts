// Repository: unico punto che sa DOVE stanno i dati. Due implementazioni della stessa interfaccia:
// InMemoryAccountRepository (G2-G4) e PrismaAccountRepository (G5): si scambiano nel composition root.
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, Customer as CustomerRow } from "@prisma/client";
import { ConflictError } from "../../utils/errors";
import { isPrismaError } from "../../utils/prismaErrors";
import { CreateCustomerDto, Customer, CustomerStatus, UpdateCustomerDto } from "./customer.types";

export interface ICustomerRepository {
  findAll(): Promise<Customer[]>;
  findById(id: string): Promise<Customer | null>;
  findByFiscalCode(fiscalCode: string): Promise<Customer | null>;
  create(dto: CreateCustomerDto): Promise<Customer>;
  update(id: string, dto: UpdateCustomerDto): Promise<Customer | null>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryCustomerRepository implements ICustomerRepository {
  private customers: Customer[] = [];

  async findAll(): Promise<Customer[]> { return [...this.customers]; }

  async findById(id: string): Promise<Customer | null> {
    return this.customers.find(c => c.id === id) ?? null;
  }

  async findByFiscalCode(fiscalCode: string): Promise<Customer | null> {
    const fc = fiscalCode.toUpperCase();
    return this.customers.find(c => c.fiscalCode === fc) ?? null;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const customer: Customer = {
      id: randomUUID(), ...dto,
      fiscalCode: dto.fiscalCode.toUpperCase(),
      status: CustomerStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date(),
    };
    this.customers.push(customer);
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer | null> {
    const index = this.customers.findIndex(c => c.id === id);
    if (index === -1) return null;
    // Scarta i campi undefined: altrimenti lo spread cancellerebbe i valori esistenti
    const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    this.customers[index] = { ...this.customers[index], ...changes };
    return this.customers[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.customers.findIndex(c => c.id === id);
    if (index === -1) return false;
    this.customers.splice(index, 1);
    return true;
  }
}

const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  fiscalCode: row.fiscalCode,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  status: row.status as CustomerStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Customer[]> {
    const rows = await this.prisma.customer.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toCustomer);
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    return row && toCustomer(row);
  }

  async findByFiscalCode(fiscalCode: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findUnique({ where: { fiscalCode: fiscalCode.toUpperCase() } });
    return row && toCustomer(row);
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      const row = await this.prisma.customer.create({ data: { ...dto, fiscalCode: dto.fiscalCode.toUpperCase() } });
      return toCustomer(row);
    } catch (e) {
      // fiscalCode o email già presenti (unique)
      if (isPrismaError(e, "P2002")) throw new ConflictError("Codice fiscale o email già registrati");
      throw e;
    }
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer | null> {
    try {
      const row = await this.prisma.customer.update({ where: { id }, data: dto });
      return toCustomer(row);
    } catch (e) {
      if (isPrismaError(e, "P2025")) return null;
      if (isPrismaError(e, "P2002")) throw new ConflictError("Email già registrata");
      throw e;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.customer.delete({ where: { id } });
      return true;
    } catch (e) {
      if (isPrismaError(e, "P2025")) return false;
      if (isPrismaError(e, "P2003")) throw new ConflictError("Il cliente ha conti collegati: eliminali o chiudili prima");
      throw e;
    }
  }
}
