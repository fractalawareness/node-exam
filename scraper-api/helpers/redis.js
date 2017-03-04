import redis from 'redis';
import bluebird from 'bluebird';
import hash from 'object-hash';
import config from '../config';

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
let redisClientInstance;

function redisClient() {
  return new Promise((resolve, reject) => {
    if (redisClientInstance && redisClientInstance.connected) {
      return resolve(redisClientInstance);
    }
    const client = redis.createClient(config.REDIS_PORT, config.REDIS_HOST);
    client.on('error', reject);
    client.on('connect', () => {
      redisClientInstance = client;
      return resolve(client);
    });
  });
}

// Keep it simple
function saveToList(client, paramsHash, data) {
  return Promise.all(data.map(item => client.rpushAsync(paramsHash, item)));
}

function* searchInList(params) {
  const client = yield redisClient();
  const paramsHash = hash(params);

  const result = yield client.hgetAsync(config.REDIS_SEARCH_LIST, paramsHash);

  return result;
}

function* saveInRedis(params, data = []) {
  const client = yield redisClient();
  const paramsHash = hash(params);
  // Save record to hash table
  // You should write logs, not comments
  yield client.hsetAsync(config.REDIS_SEARCH_LIST, paramsHash, JSON.stringify(params));
  // Save record to search result redis list
  const result = yield saveToList(client, paramsHash, data);
  yield client.expireAsync(paramsHash, config.REDIS_SESSION_EXPIRE);

  return result;
}

function* getSearchResult(params) {
  const client = yield redisClient();
  const paramsHash = hash(params);
  // Check list
  const listLenght = yield client.llenAsync(paramsHash);
  if (listLenght !== 0) {
    // Get list results
    const searchResult = yield client.lrangeAsync(paramsHash, 0, -1);
    return searchResult;
  }
  return false;
}

function* getAllSearch() {
  const client = yield redisClient();
  const result = yield client.hvalsAsync(config.REDIS_SEARCH_LIST)
    .then(res => res.map(item => JSON.parse(item)));

  return result;
}

function* deleteSearchResult(params) {
  const client = yield redisClient();
  const paramsHash = hash(params);
  const delFromHash = yield client.hdelAsync(config.REDIS_SEARCH_LIST, paramsHash);
  // .then(res => res) is redundant code
  if (delFromHash === 0) {
    return false;
  }
  const delFromList = yield client.delAsync(paramsHash);
  if (delFromList === 0) {
    return false;
  }
  return true;
}

module.exports = {
  searchInList,
  saveInRedis,
  getSearchResult,
  getAllSearch,
  deleteSearchResult,
};
