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

 * Crosslake
 - Lewis Daly <lewisd@crosslaketech.com>

 --------------
 ******/
'use strict'

const Rx = require('rxjs');
const Util = require('../../lib/utility');
const TransferSubscriptionModel = require('../../models/transferSubscription').transferSubscriptionModel;

/**
 * @function thirdpartyNotificationFilter
 * @description A filter that ignores events not in the `transferSubscription` model
 * @param {*} message - The message object from Kafka
 * @returns null or the subscription object
 */
// TODO: this was supposed to be a nice filter, but rxjs doesn't seem to like async functions
async function thirdpartyNotificationFilter(message) {
  const transferId = message.value.metadata.correlationId
  const subscription = await TransferSubscriptionModel.findOne({transferId})

  console.log('mongo found subscription', subscription);
  // if (!subscription) {
  //   return false;
  // }

  // return true;
  return subscription
}


/**
 * @function thirdpartyNotificationObservable
 * @description An observable which handles incoming messages of type 
 *   'commit', looks up interested parties, and emits thirdpartyTransfer
 *   events
 * @param {*} message - The message object from Kafka
 * @returns {function} Observable - A Rx.Observable
 */
function thirdpartyNotificationObservable(message) {
  const handler = async observer => {
    console.log('thirdpartyNotificationObservable message', message)

    const subscription = await thirdpartyNotificationFilter(message);
    if (!subscription) {
      observer.next({ action: 'finish' })
      return;
    }

    // NOTE: This is how the other services publish kafka events after
    // executing their business logic, but I think they have some sort
    // of other logic that we don't want

    // observer.next({
    //   payload: {
    //     from: 'central-event-processor',
    //     to: 'thirdparty-api-adapter',
    //   },
    //   action: 'produceToKafkaTopic',
    //   actionResult: true,
    //   message,
    //   // params: action.params,
    //   // message: {
    //   //   thingo: 'hello'
    //   // },
    //   eventAction: 'thirdparty-transfer'
    // })

    // TODO: emit a thirdparty-request-message, based on the subscription
    await Util.produceGeneralMessage('notification', 'thirdparty-transfer', message, {})

    // on success, remove the subscription
    await thirdpartyUnsubscribeObservable(message)
  }

  return Rx.Observable.create(handler)
}

/**
 * @function thirdpartySubscribeObservable
 * @description An observable which handles incoming messages of type 
 *   'subscription', and saves susbcriptions to 
 * @param {*} message - The message object from Kafka
 * @returns {function} Observable - A Rx.Observable
 */
function thirdpartySubscribeObservable(message) {
  const handler = async observer => {
    console.log('thirdpartySubscribeObservable with message', message.value.metadata.event)

    //TODO: get the details from the message, for now this will do
    const transferId = message.value.metadata.correlationId
    const participantId = message.value.metadata.event.participantId
    const subscriptionObject = {
      transferId,
      participantId,
    }
    const document = await TransferSubscriptionModel.create(subscriptionObject)
    return document.toObject();
  }

  return Rx.Observable.create(handler)
}

/**
 * @function thirdpartyUnsubscribeObservable
 * @description An observable which unsubscribes from future messages
 * @param {*} message - The message object from Kafka
 * @returns {function} Observable - A Rx.Observable
 */
async function thirdpartyUnsubscribeObservable(message) {
  // const handler = async observer => {
    console.log('thirdpartyUnsubscribeObservable with message', message)

    // correlationId is the transferId from the notification event
    const transferId = message.value.metadata.correlationId

    console.log('deleting subscription for transferId', transferId)
    await TransferSubscriptionModel.deleteOne({transferId})
    return
  // }

  // return Rx.Observable.create(handler)
}

module.exports = {
  thirdpartyNotificationFilter,
  thirdpartyNotificationObservable,
  thirdpartySubscribeObservable,
  thirdpartyUnsubscribeObservable,
}