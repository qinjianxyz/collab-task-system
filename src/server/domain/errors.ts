export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DependencyCycleError extends DomainError {}

export class InvalidStatusTransitionError extends DomainError {}

export class ConcurrencyConflictError extends DomainError {}
