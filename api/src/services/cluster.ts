// Imports
import * as redis from 'redis';
import * as mongodb from 'mongodb';

// Imports models
import {
    Node
} from './../models/node';

export class ClusterService {

    private mongoUrl: string;

    constructor(private redisProvider: any, private mongoClient: mongodb.MongoClient, config: any) {
        this.mongoUrl = config.mongoUrl;
    }


    list(): Promise<string[]> {
        return this.mongoClient.connect(this.mongoUrl).then((db: mongodb.Db) => {
            let collection = db.collection('nodes');

            return collection.aggregate([
                { $match: {} }
                , {
                    $group:
                    {
                        _id: '$clusterName'
                    }
                }
            ]).toArray().then((result: any[]) => {
                db.close();
                return result;
            });
        }).then((results: any[]) => {
            return results.filter(x => x._id != null).map(x => x._id);
        });
    }


    details(clusterName: string): Promise<any> {
        return this.listNodes(clusterName).then((nodes: Node[]) => {
            let promisesList = nodes.map(x => this.getNodeDetails(x.ipAddress, x.port));

            return Promise.all(promisesList);
        }).then((values: any[]) => {
            values = values.filter(x => x.role == 'master');
            return {
                used_memory: values.length == 0 ? 0 : Math.round(values.map(x => x.used_memory).reduce((a, b) => {
                    return a + b;
                }) / 1000000),
                expired_keys: values.length == 0 ? 0 : values.map(x => x.expired_keys).reduce((a, b) => {
                    return a + b;
                }),
                evicted_keys: values.length == 0 ? 0 : values.map(x => x.evicted_keys).reduce((a, b) => {
                    return a + b;
                }),
                connected_clients: values.length == 0 ? 0 : values.map(x => x.connected_clients).reduce((a, b) => {
                    return a + b;
                })
            };
        });
    }

    clear(clusterName: string, pattern: string): Promise<Boolean[]> {
        return this.listNodes(clusterName).then((nodes: Node[]) => {
            let tasks = nodes.map(x => this.clearNodeKeys(x.ipAddress, x.port, pattern));
            return Promise.all(tasks);
        });
    }

    listClusterKeys(clusterName: string): Promise<string[]> {
        return this.listNodes(clusterName).then((nodes: Node[]) => {
            let tasks = nodes.map(x => this.listNodeKeys(x.ipAddress, x.port, '*'));
            return Promise.all(tasks);
        }).then((values: Array<string[]>) => {
            let arr: string[] = [];

            for (let i = 0; i < values.length; i++) {
                arr = arr.concat(values[i]);
            }

            return arr.filter((elem: string, pos: number) => {
                return arr.indexOf(elem) == pos;
            });
        });
    }


    private clearNodeKeys(ipAddress: string, port: number, pattern: string): Promise<Boolean> {
        return this.listNodeKeys(ipAddress, port, pattern).then((keys: string[]) => {
            let tasks = [];

            for (let i = 0; i < keys.length; i++) {
                let p = new Promise((resolve: Function, reject: Function) => {

                    let redisClient: redis.RedisClient = this.redisProvider.createClient({
                        host: ipAddress,
                        port: port
                    });

                    redisClient.on('error', (err: Error) => {
                        resolve(false);
                        redisClient.quit();
                    });

                    redisClient.del(keys[i], () => {
                        resolve(true);
                        redisClient.quit();
                    });
                });

                tasks.push(p);
            }

            return Promise.all(tasks);
        }).then((results: any[]) => {
            return true;
        });
    }

    private listNodeKeys(ipAddress: string, port: number, pattern: string): Promise<string[]> {
        return new Promise((resolve: Function, reject: Function) => {
            let redisClient: redis.RedisClient = this.redisProvider.createClient({
                host: ipAddress,
                port: port
            });

            redisClient.on('error', (err: Error) => {
                resolve(null);
                redisClient.quit();
            });

            redisClient.keys(pattern, (err: Error, keys: string[]) => {

                if (err) {
                    resolve(null);
                } else {
                    resolve(keys);
                }

                redisClient.quit();
            });
        });
    }


    private listNodes(clusterName: string): Promise<Node[]> {
        return this.mongoClient.connect(this.mongoUrl).then((db: mongodb.Db) => {
            let collection = db.collection('nodes');

            return collection.find({
                clusterName: clusterName
            }).toArray()
                .then((result: Node[]) => {
                    db.close();
                    return result;
                });
        }).then((result: Node[]) => {
            return result.map(x => new Node(x.clusterName, x.ipAddress, x.port));
        });
    }


    private getNodeDetails(ipAddress: string, port: number): Promise<any> {
        return new Promise((resolve: Function, reject: Function) => {
            let redisClient: redis.RedisClient = this.redisProvider.createClient({
                host: ipAddress,
                port: port
            });

            redisClient.on('error', (err: Error) => {
                resolve({
                    used_memory: 0,
                    expired_keys: 0,
                    evicted_keys: 0,
                    connected_clients: 0,
                    role: null
                });

                redisClient.quit();
            });

            redisClient.info((err: Error, result: any) => {

                if (err) {
                    reject(err);
                    return;
                }

                let arr = result.split(/\r?\n/).map(x => {
                    return {
                        key: x.split(':')[0],
                        value: x.split(':')[1]
                    };
                });

                resolve({
                    used_memory: parseFloat(arr.filter(z => z.key == 'used_memory')[0].value),
                    expired_keys: parseFloat(arr.filter(z => z.key == 'expired_keys')[0].value),
                    evicted_keys: parseFloat(arr.filter(z => z.key == 'evicted_keys')[0].value),
                    connected_clients: parseFloat(arr.filter(z => z.key == 'connected_clients')[0].value),
                    role: arr.filter(z => z.key == 'role')[0].value
                });

                redisClient.quit();
            });
        });
    }

}