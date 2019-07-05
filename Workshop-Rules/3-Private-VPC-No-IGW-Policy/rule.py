# Import libraries - Lambda will require ipaddress to be uploaded

import json
import logging
import boto3

config_service = boto3.client('config')
ec2_service = boto3.client('ec2');

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# This is where it's determined whether the resource is compliant or not.
def evaluate_compliance(configuration_item, rule_parameters):
    logger.info('CONFIGURATION: ' + json.dumps(configuration_item['configuration']))

    vpc_id = configuration_item['configuration']['vpcId']
    logger.info('VPC_ID: ' + vpc_id)

    tags = configuration_item['configuration']['tags']
    logger.info('TAGS: ' + json.dumps(tags))

    tags_private = list(filter((lambda x: x['key'] == 'private'), tags))
    logger.info('TAGS_PRIVATE: ' + json.dumps(tags_private))

    if tags_private:
        tag_private = tags_private[0]
        logger.info('TAG_PRIVATE: ' + json.dumps(tag_private))

        if tag_private['value'] == 'true':
            response = ec2_service.describe_internet_gateways(
                Filters = [
                    {
                        'Name': 'attachment.vpc-id',
                        'Values': [ vpc_id ]
                    }
                ]
            )
            logger.info('response: ' + json.dumps(response))

            if response['InternetGateways']:
                logger.info('RESULT: False')
                return False

    logger.info('RESULT: True')
    return True

# Lambda Function Handler filename.handler -
# Creates AWS Config Rule connection and parses event object to find VPC CIDR's
def lambda_handler(event, context):
    logger.info(json.dumps(event))

    event_item = json.loads(event['invokingEvent'])
    rule_params = json.loads(event['ruleParameters'])
    config_item = event_item['configurationItem']
    resource_type = config_item['resourceType']

    logger.info(json.dumps(event_item))
    


# Make sure config_item is not deleted and of the correct type
    if config_item['configurationItemStatus'] == 'ResourceDeleted' or \
       resource_type != 'AWS::EC2::VPC':
        return

# Setup the Evaluation object and set its variables to the event object
    evaluation = {
        'ComplianceResourceType': config_item['resourceType'],
        'ComplianceResourceId': config_item['resourceId'],
        'ComplianceType': 'NON_COMPLIANT',
        'OrderingTimestamp': config_item['configurationItemCaptureTime']
    }
# Execute evaluation
    result = evaluate_compliance(config_item, rule_params)

    if result is True:
        evaluation['ComplianceType'] = 'COMPLIANT'
    else:
        evaluation['ComplianceType'] = 'NON_COMPLIANT'
# Return the evaluation status to the AWS Config Rule service
    if "dryRun" not in event:
        config_service.put_evaluations(
           Evaluations=[evaluation], ResultToken=event['resultToken']
        )
    return evaluation['ComplianceType']
