import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.entity';
import { InvalidCurrencyException } from '../../common/exceptions/billing.exception';

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  async findAll(): Promise<Currency[]> {
    return await this.currencyRepository.find({
      where: { isActive: true },
    });
  }

  async findByCode(code: string): Promise<Currency | null> {
    return await this.currencyRepository.findOne({
      where: { code },
    });
  }

  async validateCurrency(code: string): Promise<Currency> {
    const currency = await this.findByCode(code);
    
    if (!currency) {
      throw new InvalidCurrencyException(code);
    }

    if (!currency.isActive) {
      throw new InvalidCurrencyException(code);
    }

    return currency;
  }

  async initializeDefaultCurrencies(): Promise<void> {
    const defaultCurrencies = [
      { code: 'USD', name: 'US Dollar', type: 'fiat' as const, precision: 2 },
      { code: 'EUR', name: 'Euro', type: 'fiat' as const, precision: 2 },
      { code: 'GBP', name: 'British Pound', type: 'fiat' as const, precision: 2 },
      { code: 'BTC', name: 'Bitcoin', type: 'non-fiat' as const, precision: 8 },
      { code: 'ETH', name: 'Ethereum', type: 'non-fiat' as const, precision: 8 },
      { code: 'POINTS', name: 'Loyalty Points', type: 'non-fiat' as const, precision: 0 },
    ];

    for (const currencyData of defaultCurrencies) {
      const existing = await this.findByCode(currencyData.code);
      if (!existing) {
        const currency = this.currencyRepository.create({
          ...currencyData,
          isActive: true,
        });
        await this.currencyRepository.save(currency);
      }
    }
  }
}

