import { Body, Controller, Get, Inject, Param, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiModelProperty, ApiResponse, ApiUseTags } from '@nestjs/swagger';
import { Model, Schema } from 'mongoose';
import * as rp from 'request-promise-native';
import { environment } from '../../environment';
import * as scraperjs from 'scraperjs';
import { AuthGuard } from '../auth/auth.guard';
import { CronJob } from 'cron';
import { ConsulService } from '../consul/consul.service';
import { error } from 'util';

interface PlacesData {
  fid         : string;
  name        : string;
  lat         : number;
  lon         : number;
  rawIndex?   : any;
}

@ApiUseTags('places')
@Controller('places')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class CronController {

  cronJob: any;

  constructor(private consulService: ConsulService) {
    // this.cronJob = new CronJob('0 */1 * * * *', () => {
    //   this.next();
    // }, null, true, 'America/Los_Angeles');
  }


  @Get('next/:c')
  @ApiResponse({ status: 200, description: `Trigger scraper`})
  async next(@Req() request, @Param('c') c: string): Promise<any> {
    const headers = { 'authorization': request.headers['authorization'] };
    const storeUrl = this.consulService.getRandomServiceUri('rso-store');
    let entries = await rp({ uri: `${ storeUrl }/places/pending`, json: true, headers });
    entries = entries.slice(0, + c);
    const endpoints = entries.map(x => {
      let uri = environment.target.substring(0, 34);
      uri = `${uri}/${ uri.split("/").pop() }-${ x.fid }.html`;

      const webUrl = this.consulService.getRandomServiceUri('rso-web');
      const orderUrl = this.consulService.getRandomServiceUri('rso-order');
      rp.post(`${ webUrl }/process`,{ json: true, body: {
          token: request.headers['authorization'],
          id: x._id,
          url: uri
        }});

      try {
        if (orderUrl) {
          rp.get(`${ orderUrl }`, {
            json: true, body: {
              token: request.headers['authorization'],
              id   : x._id,
              url  : uri
            }
          });
        }
      } catch (e) {
        // ignore CB will handle
      }

      return { ...x, uri, id: x._id };
    });

    return { job: 'STARTED', endpoints };
  }

  async getIndex() {
    return new Promise((resolve, reject) => {
      scraperjs.StaticScraper.create(environment.target)
        .scrape(($) => {
          const sel = '.' + 'h' + 532;
          const x = $(sel);
          if (x && x.length) {
            const data = x[0].attribs['element-pitch-search'];
            resolve(JSON.parse(data));
          } else {
            reject();
          }
        });
    });
  }

  shuffle(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }


  @Get('kill')
  @ApiResponse({ status: 200, description: `Kill app`})
  async kill(@Req() request) {
    process.exit(1);
  }

  @Get('simulatefail')
  @ApiResponse({ status: 200, description: `Kill app`})
  async simulateFail(@Req() request) {
    environment.simulateFail = true;
    return { ok: true }
  }


  @Get('rebuild')
  @ApiResponse({ status: 200, description: `Rebuild index`})
  async rebuild(@Req() request) {
    const headers = { 'authorization': request.headers['authorization'] };
    try {
      const data = await this.getIndex() as any;
      const locations = this.shuffle(data.locations || []);
      const out = [];
      for (let i in locations) {
        if (+ i > 3) {
          break;
        }

        const x: {
          _id: string;
          name: string;
          gps: number[];
        } = locations[i];

        const storeUrl = this.consulService.getRandomServiceUri('rso-store');
        if (storeUrl) {
          let entry = await rp({ uri: `${ storeUrl }/places/find/fid/${ x._id }`, json: true, headers });
          if (!entry.length) {
            const body = {
              fid         : x._id,
              name        : x.name,
              lat         : x.gps[0],
              lon         : x.gps[1],
              rawIndex   : x,
            };
            entry = await rp.post(`${ storeUrl }/places`, { json: true, headers, body });
            out.push(entry._id);
          } else {
            out.push(entry._id);
          }
        } else {
          out.push('@NO_STORE');
        }
      }
      return out;
    } catch (e) {
      error(e);
      throw e;
    }
  }
}
