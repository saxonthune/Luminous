export interface DataflowDocument {
  v: number;
  boxes: DataflowBox[];
  flows: DataflowFlow[];
}

export interface DataflowBox {
  id: string;
  name: string;
  description?: string;
  contract?: ContractBlock;
  group?: string;
}

export interface ContractBlock {
  format: string;
  text: string;
}

export interface DataflowFlow {
  from: string;
  to: string;
}

export interface AddBoxAction {
  type: 'addBox';
  name: string;
  description?: string;
  contract?: ContractBlock;
  group?: string;
}

export interface SetBoxAction {
  type: 'set';
  id: string;
  name?: string;
  description?: string;
  contract?: ContractBlock;
  group?: string | null;
}

export interface ConnectAction {
  type: 'connect';
  from: string;
  to: string;
}

export interface DisconnectAction {
  type: 'disconnect';
  from: string;
  to: string;
}

export interface RemoveBoxAction {
  type: 'removeBox';
  id: string;
  cascade?: boolean;
}

export type DataflowAction =
  | AddBoxAction
  | SetBoxAction
  | ConnectAction
  | DisconnectAction
  | RemoveBoxAction;
