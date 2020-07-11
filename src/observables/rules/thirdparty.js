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

const RuleEngine = require('json-rules-engine')
const Rx = require('rxjs')
const TransferSubscriptionModel = require('../../models/transferSubscription');

/**
 * @function thirdpartySubscribeObservable
 * @description An observable which handles incoming messages of type 
 *   'subscription', and saves susbcriptions to 
 * @param {*} message - The message object from Kafka
 * @returns {function} Observable - A Rx.Observable
 */
function thirdpartySubscribeObservable(message) {
  const handler = async observer => {
    console.log('thirdpartySubscribeObservable with message', message)

    //TODO: get the details from the message, for now this will do
    const subscriptionObject = {
      transferId: '12345',
      participantId: 'pispa',
    }
    const document = await transferSubscriptionModel.create(subscriptionObject)
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
function thirdpartyUnsubscribeObservable(message) {
  const handler = async observer => {
    console.log('thirdpartyUnsubscribeObservable with message', message)

    //TODO: get the details from the message, for now this will do
    const tranferId = '12345';
  
    await transferSubscriptionModel.deleteOne({transferId})
    return
  }

  return Rx.Observable.create(handler)
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
    console.log('Handler is being called with message', message)

    //TODO: emit a thirdparty-request-message

  }

  return Rx.Observable.create(handler)
}



module.exports = {
  thirdpartyNotificationObservable
}