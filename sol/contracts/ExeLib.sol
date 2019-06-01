pragma solidity ^0.5.6;

library ExeLib {
  struct Function {
    address functionAddress;
    bool call;
  }

  function isPermissible (bytes memory bytecode, bool disallowDestruct)
  internal pure returns (bool permissible) {
    uint size = bytecode.length;
    permissible = true;
    assembly {
      let ptr := add(bytecode, 0x20)
      for { let i := 0 } lt(i, size) { i := add(i, 0x1) } {
        let op := shr(0xf8, mload(add(ptr, i)))
        switch op
        case 0xf2 { permissible := 0 break } // callcode
        case 0xf4 { permissible := 0 break } // delegatecall
        case 0x55 { permissible := 0 break } // sstore
        case 0xff { if disallowDestruct { permissible := 0 break } } // selfdestruct
        default {
          let isPush := and(lt(op, 0x80), gt(op, 0x5f))
          if eq(isPush, 0x1) { i := add(i, sub(0x21, sub(0x80, op))) }
        }
      }
    }
  }

  function delegateExecute(bytes memory bytecode) internal {
    uint size = bytecode.length;
    assembly {
      let start := add(bytecode, 0x20)
      let delegateTo := create(0, start, size)
      let retptr := mload(0x40)
      let delegateSuccess := delegatecall(gas, delegateTo, 0, 0, retptr, 0)
      let retsize := returndatasize
      returndatacopy(retptr, 0, retsize)
      let freeptr := add(retptr, retsize)
      mstore(freeptr, 0x41c0e1b500000000000000000000000000000000000000000000000000000000)
      let selfdestructSuccess := call(gas, delegateTo, 0, freeptr, 0x20, freeptr, 0)
      let success := and(delegateSuccess, selfdestructSuccess)
      if success { return(retptr, retsize) }
      revert(0, 0)
    }
  }

  function delegateExecute(address delegateTo) internal {
    assembly {
      let startCalldata := mload(0x40)
      calldatacopy(startCalldata, 0, calldatasize)
      let retptr := add(startCalldata, calldatasize)
      let delegateSuccess := delegatecall(gas, delegateTo, startCalldata, calldatasize, retptr, 0)
      if delegateSuccess { return (retptr, returndatasize) }
      revert(0, 0)
    }
  }
  
  function bytecodeAt(address deployedAddress)
  internal view returns (bytes memory bytecode) {
    uint size;
    assembly { size := extcodesize(deployedAddress) }
    bytecode = new bytes(size);
    assembly { extcodecopy(deployedAddress, add(bytecode, 0x20), 0, size) }
  }
}