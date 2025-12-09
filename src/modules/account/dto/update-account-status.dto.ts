import { IsEnum } from 'class-validator';
import { AccountStatus } from '../account.types';

export class UpdateAccountStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}
