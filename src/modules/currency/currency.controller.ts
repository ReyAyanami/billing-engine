import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrencyService } from './currency.service';
import { Currency } from './currency.entity';

@ApiTags('currencies')
@Controller('api/v1/currencies')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @ApiOperation({
    summary: 'List all currencies',
    description:
      'Returns all active currencies supported by the system (fiat and non-fiat)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of currencies',
    type: [Currency],
  })
  async findAll(): Promise<Currency[]> {
    return await this.currencyService.findAll();
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get currency by code',
    description:
      'Retrieves details of a specific currency by its code (e.g., USD, BTC)',
  })
  @ApiParam({
    name: 'code',
    description: 'Currency code (e.g., USD, EUR, BTC)',
    example: 'USD',
  })
  @ApiResponse({ status: 200, description: 'Currency found', type: Currency })
  @ApiResponse({
    status: 400,
    description: 'Currency not supported or inactive',
  })
  async findByCode(@Param('code') code: string): Promise<Currency> {
    return await this.currencyService.validateCurrency(code);
  }
}
