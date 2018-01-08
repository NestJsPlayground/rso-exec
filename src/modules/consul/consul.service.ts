import { Component } from '@nestjs/common';
import * as os from 'os';
import * as Consul from 'consul';
import { info, error } from 'winston';
import { environment } from '../../environment';
import * as GError from '@google-cloud/error-reporting';

let errors = { report: (x: any) => {} };
if (environment.envType !== 'test') {
  errors = GError();
}

export interface TaggedAddresses {
  lan: string;
  wan: string;
}

export interface NodeMeta {
  'consul-network-segment': string;
}

export interface ServiceItem {
  ID: string;
  Node: string;
  Address: string;
  Datacenter: string;
  TaggedAddresses: TaggedAddresses;
  NodeMeta: NodeMeta;
  ServiceID: string;
  ServiceName: string;
  ServiceTags: string[];
  ServiceAddress: string;
  ServicePort: number;
  ServiceEnableTagOverride: boolean;
  CreateIndex: number;
  ModifyIndex: number;
}

@Component()
export class ConsulService {

  watchMap = {};

  watchValues = {
    'core/maintenance': true as any,
  };

  consul = Consul(environment.consul);

  static serviceRegistered: boolean = false;

  get maintenance(): boolean {
    return !!this.watchValues['core/maintenance'];
  }

  constructor() {
    this.init();

    const self = this;
    process.on('uncaughtException', (err) => {
      // catch consul error
      if (err && err.message === 'consul: kv.get: socket hang up') {
        error('Consul: socket hang up');
        errors.report(err);
        ConsulService.serviceRegistered = false;

        for (let watchKey in self.watchMap) {
          if (self.watchMap[watchKey]) {
            self.watchMap[watchKey].end();
            self.watchMap[watchKey] = void 0;
            console.log(`Clearing watch for ${ watchKey }`);
          }
        }

        setTimeout(() => {
          self.init();
        }, 10 * 1000)
      } else {
        error('uncaughtException', err);
        errors.report(err);
        process.exit(1);
      }
    });
  }

  init() {
    info('Trying to connect to consul.');
    try {
      this.consul = this.consul || Consul(environment.consul);
      this.registerService();
    } catch (e) {
      error(e);
      setTimeout(() => {
        this.init();
      }, 10 * 1000)
    }
  }

  registerService() {
    const networkInterfaces = os.networkInterfaces();
    const itf = networkInterfaces['eth0'] || networkInterfaces['ens33'];

    const service: Consul.Agent.Service.RegisterOptions & { deregistercriticalserviceafter?: string } = {
      name: environment.appName,
      id: environment.appId,
      tags: [ `Deploy version: ${ environment.deployVersion }` ],
      address: itf[0].address,
      port: environment.port,
      check: {
        http : `http://${ itf[0].address }:${ environment.port }/health`,
        ttl: '10s',
        interval: '10s',
        status: 'passing',
        notes: 'API health check.',
        deregistercriticalserviceafter: '1m'
      }
    };

    this.consul.agent.service.register(service, (err) => {
      if (err) {
        error('Consul service register error.', err);
        setTimeout(() => {
          this.registerService();
        }, 10 * 1000)
      } else {
        this.initWatch();
        ConsulService.serviceRegistered = true;
      }
    });
  }

  initWatch() {
    this.watchService('rso-store');
    this.watchService('rso-auth');
    this.watchService('rso-web');
    this.watchService('rso-order');

    // TEST
    // setTimeout(() => {
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    //   console.info(this.getRandomService('rso-seed'));
    // }, 5000)

    try {
      this.watch('core/maintenance', false);
    } catch (e) {
      error('There was problem with consul', e);
    }
  }

  getRandomServiceUri(service: string) {
    const x = this.getRandomService(service);
    return x && `http://${ x.ServiceAddress }:${ x.ServicePort }`;
  }

  getRandomService(service: string): ServiceItem {
    const items = this.watchValues[`@${ service }`] || [];
    if (!items.length) {
      return void 0;
    }
    const x = items[Math.floor(Math.random() * items.length)];
    return x;
  }

  watchService(service: string) {
    if (!this.watchMap[`@${ service }`]) {
      this.watchMap[`@${ service }`] = this.consul.watch({method: this.consul.catalog.service.nodes, options: { service } as any});
      this.watchMap[`@${ service }`].on('change', (data, res) => {
        console.info(`Consule service data for ${ service }: `, data);
        this.watchValues[`@${ service }`] = data;
      });
    }
  }

  getService(service: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.consul.catalog.service.nodes(service, function(err, result) {
        if (err) {
          error(`Get consule service for ${ service } failed.`, err);
          reject(err);
        } else {
          info(`Get consule service for ${ service }: `, result);
          resolve(result);
        }
      });
    });

  }

  get(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.consul.kv.get(key, function(err, result) {
        if (err) {
          error(`Get consule data for ${ key } failed.`, err);
          reject(err);
        } else {
          info(`Get consule data for ${ key }: `, result);
          resolve(result);
        }
      });
    });
  }

  watch(key: string, defaultVal?: any) {
    try {
      if (!this.watchMap[key]) {
        this.watchMap[key] = this.consul.watch({method: this.consul.kv.get, options: {key}});
        this.watchMap[key].on('change', (data, res) => {
          info(`Consule data for ${ key }: `, data);
          this.watchValues[key] = data ? data.Value : defaultVal;
        });
      }
    } catch (e) {
      error('There was problem with consul', e);
    }
  }
}
