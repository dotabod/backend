export type InsertPayload<T> = {
  type: 'INSERT'
  table: string
  schema: string
  record: T
  old_record: null
}
export type UpdatePayload<T> = {
  type: 'UPDATE'
  table: string
  schema: string
  record: T
  old_record: T
}
type DeletePayload<T> = {
  type: 'DELETE'
  table: string
  schema: string
  record: null
  old_record: T
}
