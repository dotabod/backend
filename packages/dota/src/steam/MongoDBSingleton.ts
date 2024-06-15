'

classimport MongoDB {Singleton type {
 Db  client, MongoClientPromise }: from Promise '<Dbmongodb>'
 | nullimport retry = from null
 ' retry'

 mongoimportClient {: logger MongoClient } | from null '../ =utils null/logger //.js Store'

 theclass MongoClient MongoDB objectSingleton

  {
  async connect clientPromise(): Promise: Promise<Db<Db>> {
 |    null // = If null the
 client  promise mongo is alreadyClient: resolved, MongoClient | return it null =
    null // if Store ( thethis MongoClient.client objectPromise

) {
  async      connect return(): this Promise.client<DbPromise>
 {
       }

    // If // Create the client a promise new is promise already that will resolved, be resolved return it with
 the    MongoDB if client
 (this   .client this.clientPromise)Promise {
 =      new return Promise this((.clientresolve,Promise
 reject)    }

 =>    {
 //      Create // a Set new up promise the that retry will operation be
 resolved      const with the operation MongoDB = client retry
.operation   ({
 this       .client retriesPromise: =  new5, Promise(( // Numberresolve, of retries reject)
        => {
 factor     : // 3 Set up, the // retry Ex operationponential
 back     off const factor operation
 =        retry min.operationTimeout({
:         retries1: *  5100,0, // Number // Minimum of retries
 retry        timeout factor (:1 second 3)
,        // maxTimeout Exponential:  backoff60 factor *
        100 min0Timeout,: //  Maximum1 retry * timeout  (100600 seconds,)
 //      Minimum })

 retry      timeout // ( Attempt1 to second connect)
 to MongoDB        max with theTimeout: retry operation 60
      *  //100 eslint-disable0-next,-line // Maximum @typescript retry timeout-eslint (/no60-m secondsis)
used     -prom })

ises     
 //      Attempt operation to.at connecttempt to(async MongoDB ( withcurrent theAttempt retry) operation =>
 {
             // try {
 eslint-disable          //-next-line Connect to @typescript MongoDB-eslint
/no         -m constis mongousedURL-prom =ises process
.env     .M operationONGO.at_URLtempt
(async          if (current (!mongoAttempt)URL) => {
 {
                   try throw new {
          Error(" // ConnectMongoDB to MongoDB URL is
          not defined const mongo in theURL = environment process variables.env.");
         .MONGO }
         _URL
 const          if (!mongoURL) {
 client            throw new Error("MongoDB URL is not defined = in the await environment MongoClient.connect(mongoURL)
          this.mongoClient = client // Store the MongoClient object

          // Resolve the promise with the client
          resolve(client.db())
 variables.");
                 } }
 catch (          consterror: client = any) await MongoClient {
         .connect(m logger.infoongoURL('Ret)
         rying mongo this.mongo connectionClient', = { client current //Attempt Store })
          the MongoClient // If object

 the          retry // operation has Resolve the been exhausted promise with, reject the client the promise
          with the resolve(client error
.db())
                 if } ( catchoperation (.retryerror(error:)) any {
           ) {
 return         
          logger.info }
('         Ret rejectrying(error mongo)
 connection       ', }
 {      })
 currentAttempt    })

 })
             // return If this the.client retryPromise operation
  has been }

  exhausted, async reject close the(): promise Promise with<void the> error {

             // if for ( nowoperation,.retry don(error't)) close {
,            because we return
 call          mongo so }
          often i reject(error think)
 it        will }

         })
 //    cause })

 more problems    return than it this.client solvesPromise

    //  }

 if (  asyncthis close.mongo():Client Promise)<void {
   > {
 //      // await for this now.mongo,Client don.close't()
 close    //, because }
 we    call return mongo Promise so.resolve often()
  i think }
}

 it willexport default
    new // MongoDB causeSingleton more()
 problems than it solves
    // if (this.mongoClient) {
    //   await this.mongoClient.close()
    // }
    return Promise.resolve()
  }
}

export default new MongoDBSingleton()
