/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * ModusBox
 - Valentin Genev <valentin.genev@modusbox.com>
 - Deon Botha <deon.botha@modusbox.com>

 --------------
 ******/
'use strict'

/**
 * @module src/setup
 */

const Logger = require('@mojaloop/central-services-logger')
const HealthCheck = require('@mojaloop/central-services-shared').HealthCheck.HealthCheck

const Consumer = require('./lib/kafka/consumer')
const Utility = require('./lib/utility')
const Rx = require('rxjs')
const { filter, flatMap, catchError } = require('rxjs/operators')
const Enum = require('./lib/enum')
const TransferEventType = Enum.transferEventType
const TransferEventAction = Enum.transferEventAction
const Observables = require('./observables')
const Config = require('./lib/config')
const { createHealthCheckServer, defaultHealthHandler } = require('@mojaloop/central-services-health')
const { getSubServiceHealthBroker, getSubServiceHealthDatastore } = require('./lib/healthCheck/subServiceHealth')
const packageJson = require('../package.json')

const setup = async () => {
  await require('./lib/database').db()
  // TODO: should this not pass in the topic name?
  await Consumer.registerNotificationHandler()

  const topicName = Utility.transformGeneralTopicName(Utility.ENUMS.NOTIFICATION, Utility.ENUMS.EVENT)
  const consumer = Consumer.getConsumer(topicName)

  const healthCheck = new HealthCheck(packageJson, [
    getSubServiceHealthBroker,
    getSubServiceHealthDatastore
  ])
  await createHealthCheckServer(Config.get('PORT'), defaultHealthHandler(healthCheck))

  const topicObservable = Rx.Observable.create((observer) => {
    // When kafka receives a message, push it into the topic observable
    consumer.on('message', async (data) => {
      observer.next(data)
      // some fancy kafka stuff
      if (!Consumer.isConsumerAutoCommitEnabled(topicName)) {
        consumer.commitMessageSync(data)
      }
    })
  })

  /*
    General Observer
      - net debit cap breach alert
  */
  const generalObservable = topicObservable
  // When we recieve a message, filter to make sure the event.action is `commit`
    .pipe(filter(data => data.value.metadata.event.action === 'commit'),
      flatMap(Observables.CentralLedgerAPI.getDfspNotificationEndpointsObservable),
      flatMap(Observables.CentralLedgerAPI.getPositionsObservable),
      flatMap(Observables.Rules.ndcBreachObservable),
      flatMap(Observables.actionObservable),
      catchError(() => {
        return Rx.onErrorResumeNext(generalObservable)
      })
    )

  /*
    Limit Adjustments Observer
  */
  const limitAdjustmentObservable = topicObservable
    .pipe(filter(data => data.value.metadata.event.action === 'limit-adjustment' && 'limit' in data.value.content.payload),
      flatMap(Observables.CentralLedgerAPI.getDfspNotificationEndpointsForLimitObservable),
      flatMap(Observables.Store.getLimitsPerNameObservable),
      flatMap(Observables.Rules.ndcAdjustmentObservable),
      flatMap(Observables.actionObservable),
      catchError(() => {
        return Rx.onErrorResumeNext(limitAdjustmentObservable)
      })
    )

  /*
    Settlement Position Change
  */
  const settlementTransferPositionChangeObservable = topicObservable
    .pipe(filter(data => data.value.metadata.event.action === 'settlement-transfer-position-change'),
      flatMap(Observables.CentralLedgerAPI.getParticipantEndpointsFromResponseObservable),
      flatMap(Observables.actionObservable),
      // TODO: why is this commented?
      // retry()
      catchError(e => {
        console.error(e)
        return Rx.onErrorResumeNext(settlementTransferPositionChangeObservable)
      })
    )

  /*
    Thirdparty Subscription Observer
   */
  const thirdpartySubscriptionObservable = topicObservable.pipe(
    filter(data => data.value.metadata.event.action === 'subscription'),
    // TODO: filter by subscribed! events only
    flatMap(Observables.Rules.thirdpartySubscribeObservable),
    flatMap(Observables.actionObservable),
    catchError(() => {
      return Rx.onErrorResumeNext(generalObservable)
    })
  )

  /*
    Thirdparty Notification Observer
   */
  const thirdpartyNotificationObservable = topicObservable.pipe(
    filter(data => data.value.metadata.event.action === 'commit'),
    // TODO: filter by subscribed events only!
    flatMap(Observables.Rules.thirdpartyNotificationObservable),
    flatMap(Observables.actionObservable),
    // on success, remove the subscription!
    flatMap(Observables.Rules.thirdpartyUnsubscribeObservable),
    catchError(() => {
      return Rx.onErrorResumeNext(generalObservable)
    })
  )

  // Subscribe all observables
  const allObservables = [
    // TODO: renable these later
    // generalObservable,
    // limitAdjustmentObservable,
    // settlementTransferPositionChangeObservable
    thirdpartySubscriptionObservable,
    thirdpartyNotificationObservable,
  ]
  allObservables.forEach(observable => observable.subscribe({
    // TODO: surely this subscribe dict can be generalized...
    next: async ({ actionResult, message }) => {
      if (!actionResult) {
        Logger.info(`action unsuccessful. Publishing the message to topic ${topicName}`)
        // TODO we should change the state and produce error message instead of republish?
        await Utility.produceGeneralMessage(TransferEventType.NOTIFICATION, TransferEventAction.EVENT, message, Utility.ENUMS.STATE.SUCCESS)
      }
      Logger.info(actionResult)
    },
    error: err => Logger.info('Error occured: ', err),
    completed: (value) => Logger.info('completed with value', value)
  }))

}

module.exports = {
  setup
}
