import { IsEnum } from 'class-validator';
import { AccountStatus } from '../account.entity';

export class UpdateAccountStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}
