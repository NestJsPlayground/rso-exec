import {
  Controller, ForbiddenException, Get, HttpStatus, InternalServerErrorException, Res,
  UseGuards
} from '@nestjs/common';
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
    if (environment.simulateFail) {
      throw new InternalServerErrorException();
    } else {
      return {
        appId            : environment.appId,
        appName          : environment.appName,
        serviceRegistered: ConsulService.serviceRegistered,
        maintenance      : this.consulService.maintenance,
        api              : 'OK',
        db               : mongoose.connection.readyState,
        deployVersion    : environment.deployVersion,
        serverTime       : new Date()
      };
    }
  }

  @Get('/test')
  async testConnection() {
    let web;
    let store;
    const webUrl = this.consulService.getRandomServiceUri('rso-web');
    const storeUrl = this.consulService.getRandomServiceUri('rso-store');

    try {
      web = await rp({uri: `${ webUrl }/health`, json: true});
    } catch (e) {
      web = e.message;
    }

    try {
      store = await rp({uri: `${ storeUrl }/health`, json: true});
    } catch (e) {
      store = e.message;
    }


    return {
      storeUrl,
      webUrl, web, store
    };
  }
}
