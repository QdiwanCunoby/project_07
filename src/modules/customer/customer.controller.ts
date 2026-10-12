// Controller: converte HTTP ↔ business logic. Non contiene logica né try/catch:
// gli errori lanciati dal Service arrivano all'errorHandler tramite asyncHandler.
import { Request, Response } from "express";
import { CustomerService } from "./customer.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";

export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  getAll = asyncHandler(async (req: Request, res: Response) => {
    const customers = await this.service.getAllCustomers();
    res.status(200).json(ok(customers));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const customer = await this.service.getCustomerById(req.params.id);
    res.status(200).json(ok(customer));
  });

  // req.body è già validato e ripulito da validate(createCustomerSchema)
  create = asyncHandler(async (req: Request, res: Response) => {
    const customer = await this.service.createCustomer(req.body);
    res.status(201).json(ok(customer));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const customer = await this.service.updateCustomer(req.params.id, req.body);
    res.status(200).json(ok(customer));
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await this.service.deleteCustomer(req.params.id);
    res.status(204).send();
  });
}
