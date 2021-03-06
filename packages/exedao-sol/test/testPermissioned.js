const {expect} = require('chai')
const Web3 = require('web3')
const ganache = require('ganache-cli')
const web3 = new Web3(ganache.provider())
const { AbiCoder } = require('web3-eth-abi');
const coder = new AbiCoder();

const signatureOf = (functionAbi) => coder.encodeFunctionSignature(functionAbi);

const {bytecode, abi} = require('../build/Permissioned')
let accounts

const mintSig = signatureOf('mintShares(address,uint64)')
const setReqSig = signatureOf('setApprovalRequirement(bytes4,uint8)')

const deploy = (address, shares, duration = 0, mintReq = 51, setReqReq = 51) => {
  const contract = new web3.eth.Contract(abi)
  return new Promise((resolve, reject) => contract
    .deploy({ data: bytecode, arguments: [shares, duration, [mintSig, setReqSig], [mintReq, setReqReq]] })
      .send({ from: address, gas: 5700000, value: 100000000000000 })
        .on('receipt', (receipt) => {
          contract._address = receipt.contractAddress;
          resolve(contract)
        })
        .on('error', (e) => reject(e))
  )
}
  

before(async () => {
  accounts = await web3.eth.getAccounts()
})

module.exports = describe('Permissioned.sol', () => {
  it('Should initialize function requirements', async () => {
    const contract = await deploy(accounts[0], 1000, 0, 51, 51)
    const req = await contract.methods.getApprovalRequirement(mintSig).call()
    expect(req).to.eq('51')
  })

  it('Should mint shares', async () => {
    const contract = await deploy(accounts[0], 1000, 0, 51, 51)
    const payload = contract.methods.mintShares(accounts[1], 501).encodeABI()
    await web3.eth.sendTransaction({from: accounts[0], data: payload, gas: 250000, to: contract._address})
    const {shares} = await contract.methods.getDaoist(accounts[1]).call()
    expect(shares).to.eq('501')
  })

  it('Should set a proposal requirement', async () => {
    const contract = await deploy(accounts[0], 1000, 0, 51, 51)
    const payload = contract.methods.setApprovalRequirement(mintSig, 51).encodeABI()
    await web3.eth.sendTransaction({from: accounts[0], data: payload, gas: 250000, to: contract._address})
    const req = await contract.methods.getApprovalRequirement(mintSig).call()
    expect(req).to.eq('51')
  })

  describe('Function Requirements', () => {
    it('Absolute Majority', async () => {
      const contract = await deploy(accounts[0], 51, 5, 51, 51)
      // Give acct #2 49 shares, acct #1 has all shares so should be able to force share minting
      let payload = contract.methods.mintShares(accounts[1], 49).encodeABI()
      let payloadHash = web3.utils.soliditySha3({ t: 'bytes', v: payload })
      await web3.eth.sendTransaction({from: accounts[0], data: payload, gas: 250000, to: contract._address})
      // console.log(payloadHash)
      // console.log(prop)
      expect(await contract.methods.getDaoist(accounts[1]).call().then(d => d.shares)).to.eq('49')
      expect(await contract.methods.getTotalShares().call()).to.eq('100')
      // Give acct #3 2 shares, acct #1 has majority so should be able to force share minting
      payload = contract.methods.mintShares(accounts[2], 2).encodeABI()
      await web3.eth.sendTransaction({from: accounts[0], data: payload, gas: 250000, to: contract._address})
      expect(await contract.methods.getDaoist(accounts[2]).call().then(d => d.shares)).to.eq('2')
      expect(await contract.methods.getTotalShares().call()).to.eq('102')
      // Acct #1 no longer has the majority, so it can not give shares by itself
      payload = contract.methods.mintShares(accounts[2], 10).encodeABI()
      const receipt = await web3.eth.sendTransaction({from: accounts[0], data: payload, gas: 250000, to: contract._address})
      console.log(receipt.gasUsed)
      expect(await contract.methods.getDaoist(accounts[2]).call().then(d => d.shares)).to.eq('2')
      // With the votes from acct #2, a majority is reached and shares should be minted
      await web3.eth.sendTransaction({from: accounts[2], data: payload, gas: 250000, to: contract._address})
      expect(await contract.methods.getDaoist(accounts[2]).call().then(d => d.shares)).to.eq('12')
    })
  }) 

  /* 
  
   const propHash = web3.utils.soliditySha3({
      t: 'bytes',
      v: contract.methods.mintShares(accounts[1], 500).encodeABI()
    });
    await contract.methods.submitOrVote(propHash).send({ from: accounts[0], gas: 4700000 })*/
})