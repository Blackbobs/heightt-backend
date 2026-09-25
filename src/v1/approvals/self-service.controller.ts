import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { SelfServiceOrganizationDto } from './self-service.dto';
import { SelfServiceService } from './self-service.service';

@Controller('self-service')
@UseGuards(JwtGuard)
export class SelfServiceController {
  constructor(private readonly service: SelfServiceService) {}

  @Post('organizations')
  organization(
    @Request() req: { user: { id: string } },
    @Body() dto: SelfServiceOrganizationDto,
  ) {
    return this.service.organization(req.user.id, dto);
  }
}
