export default class CustomError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args)
    Error.captureStackTrace(this, CustomError)
    this.name = 'CustomError'
  }
}
