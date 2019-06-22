const rp = require('request-promise');
const multihashes = require('multihashes');
const CID = require('cids');
const isBrowser = require('is-browser');

const gatewayUrl = 'https://gateway.temporal.cloud/ipfs/';

const toCid = (hash) => {
  if (hash.length == 64 || hash.length == 66) {
    const buf = Buffer.from(hash, 'hex');
    const mh = multihashes.encode(buf, 'sha3-256');
    const cid = new CID(1, 'raw', Buffer.from(mh, 'hex'), 'base32');
    return cid.toBaseEncodedString();
  }
  return hash;
}

module.exports = class API {
  constructor(web3, address, apiUrl = 'http://localhost:8000/') {
    this.web3 = web3;
    this.address = address;
    this.apiUrl = apiUrl;
    if (isBrowser) {
      const authToken = window.localStorage.getItem('auth-token');
      if (authToken) {
        const {token, expiresAt} = JSON.parse(authToken);
        this.token = token;
        this._tokenExpiresAt = expiresAt;
      }
    }
  }

  get token() { return this._token; }

  set token(token) {
    this._token = token;
    this.rp = rp.defaults({ headers: { authorization: token } })
  }

  get expiresIn() {
    const expiresAt = this._tokenExpiresAt;
    return expiresAt ? expiresAt - new Date() : -1;
  }

  saveToken(token) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 23);
    this._tokenExpiresAt = expiresAt;
    this.token = token;
    if (window) window.localStorage.setItem('auth-token', JSON.stringify({
      token,
      expiresAt
    }));
  }

  async checkToken() {
    const expiresIn = this.expiresIn
    const hr = 60 * 60 * 1000
    if (expiresIn < 0) await this.login()
    else if (expiresIn < 0.25*hr) await this.refresh();
    else return
  }

  async login() {
    console.log('exedao api: login')
    const url = `${this.apiUrl}login`;
    const options = { method: 'POST', uri: url, form: {address: this.address}, json: true };
    const res = await rp(options);
    console.log(res)
    const {data: {challenge}} = res;
    console.log('exedao api: got challenge ', challenge)
    const signature = await this.signChallenge(challenge);
    options.form = {challengeToken: challenge, signature};
    const {data: {token}} = await rp(options);
    this.saveToken(token);
    console.log('exedao api: got token ', token)
    return token;
  }

  async refresh() {
    const url = `${this.apiUrl}dao/refresh`;
    const options = { method: 'POST', uri: url, json: true };
    const {data: {token}} = await this.rp(options);
    this.saveToken(token);
  }

  signChallenge(challengeToken) {
    const challengeHash = this.web3.utils.soliditySha3(challengeToken.toString('hex'));
    const challengeParams = [
      { type: 'string', name: 'Message', value: `I certify that I am the owner of ${this.address}` },
      { type: 'bytes32', name: 'Verification ID', value: challengeHash }
    ]
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.sendAsync({
        method: 'eth_signTypedData',
        params: [challengeParams, this.address],
        from: this.address,
      }, function (err, result) {
        console.log(result)
        if (err) reject(err);
        if (result.error) reject(result.error);
        resolve(result.result);
      })
    })
  }

  async getPrivate(fileHash) {
    await this.checkToken();
    const url = `${this.apiUrl}dao/file/${fileHash}`;
    return this.rp.get(url).then(res => res.json());
  }

  async getFile(fileHash) {
    const hash = toCid(fileHash);
    const url = `${gatewayUrl}${hash}`;
    const {data: file} = await rp.get(url)
      .then(res => res.json())
      .catch((e) => {
        console.error(e);
        return this.getPrivate(fileHash);
      });
    return file;
  }

  async putProposal(data) { // data = {proposalHash, data, membersOnly, extension}
    await this.checkToken();
    const url = `${this.apiUrl}dao/putProposal`;
    const options = { method: 'POST', uri: url, form: data, json: true };
    const {data: {hash}} = await this.rp(options).then(res => res.json());
    return hash;
  }
}