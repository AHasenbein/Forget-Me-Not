import { MemoryStore } from '../../store';
import { storeContract, storeContractPillCheck } from './store-contract';

storeContract('MemoryStore', () => new MemoryStore());
storeContractPillCheck('MemoryStore', () => new MemoryStore());
