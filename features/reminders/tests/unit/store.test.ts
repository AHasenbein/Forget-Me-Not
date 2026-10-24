import { MemoryStore } from '../../store';
import { storeContract } from './store-contract';

storeContract('MemoryStore', () => new MemoryStore());
