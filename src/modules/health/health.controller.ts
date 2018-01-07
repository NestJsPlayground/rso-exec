import { Controller, ForbiddenException, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiUseTags } from '@nestjs/swagger';
import { ConsulService } from '../consul/consul.service';
import { AuthGuard } from '../auth/auth.guard';
import { environment } from '../../environment';
import * as rp from 'request-promise-native';
import * as mongoose from "mongoose";

@ApiUseTags('seed health')
@Controller('health')
export class HealthController {

  constructor(private consulService: ConsulService) {}

  @Get()
  @ApiResponse({ status: 200, description: `Service health is ok.`})
  root() {
    return {
      appId: environment.appId,
      appName: environment.appName,
      serviceRegistered: ConsulService.serviceRegistered,
      maintenance: this.consulService.maintenance,
      api: 'OK',
      db: mongoose.connection.readyState,
      deployVersion: environment.deployVersion,
      serverTime: new Date()
    };
  }

  @Get('/test')
  async testConnection() {
    let auth;
    const authUrl = this.consulService.getRandomServiceUri('rso-auth');
    try {
      auth = await rp({uri: `${ authUrl }/health`, json: true});
    } catch (e) {
      auth = e.message;
    }


    return {
      auth,
      authUrl
    };
  }
}
