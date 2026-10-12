// Service: regole di business. Non sa nulla di HTTP.
// La validazione del formato dei dati è a monte (Zod nel middleware validate):
// qui restano solo le regole che richiedono lo stato (unicità, esistenza).
import { Account, CreateAccountDto, UpdateAccountDto } from "./account.types";
import { IAccountRepository } from "./account.repository";
import { ConflictError, NotFoundError } from "../../utils/errors";

export class AccountService {
  constructor(private readonly repository: IAccountRepository) {}

  async getAllAccounts(): Promise<Account[]> {
    return this.repository.findAll();
  }

  async getAccountById(id: string): Promise<Account> {
    const account = await this.repository.findById(id);
    if (!account) throw new NotFoundError("Account con id " + id + " non trovato");
    return account;
  }

  async createAccount(dto: CreateAccountDto): Promise<Account> {
    const existing = await this.repository.findByIban(dto.iban);
    if (existing) throw new ConflictError("IBAN già registrato");
    return this.repository.create(dto);
  }

  async updateAccount(id: string, dto: UpdateAccountDto): Promise<Account> {
    const updated = await this.repository.update(id, dto);
    if (!updated) throw new NotFoundError("Account con id " + id + " non trovato");
    return updated;
  }

  async deleteAccount(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError("Account con id " + id + " non trovato");
  }
}
