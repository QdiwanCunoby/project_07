// Service: regole di business. Non sa nulla di HTTP.
// La validazione del formato dei dati è a monte (Zod nel middleware validate):
// qui restano solo le regole che richiedono lo stato (unicità, esistenza).
import { CreateCustomerDto, Customer, UpdateCustomerDto } from "./customer.types";
import { ICustomerRepository } from "./customer.repository";
import { ConflictError, NotFoundError } from "../../utils/errors";

export class CustomerService {
  constructor(private readonly repository: ICustomerRepository) {}

  async getAllCustomers(): Promise<Customer[]> {
    return this.repository.findAll();
  }

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.repository.findById(id);
    if (!customer) throw new NotFoundError("Customer con id " + id + " non trovato");
    return customer;
  }

  async createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.repository.findByFiscalCode(dto.fiscalCode);
    if (existing) throw new ConflictError("Codice fiscale già registrato");
    return this.repository.create(dto);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const updated = await this.repository.update(id, dto);
    if (!updated) throw new NotFoundError("Customer con id " + id + " non trovato");
    return updated;
  }

  async deleteCustomer(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError("Customer con id " + id + " non trovato");
  }
}
