# Import libraries - Lambda will require ipaddress to be uploaded

import json
import ipaddress
import logging
import boto3

config_service = boto3.client('config')
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# This function uses the ipaddress library to compre the 'onprem' list with AWS Account VPC's
def cidrcheck(net1, net2):
    noOverlaps = True
    prem = map(str, net1)
    for i in prem:
        n1 = ipaddress.IPv4Network(i, strict=False)
        n2 = ipaddress.IPv4Network(net2)
        if n1.overlaps(n2):
            logger.info("Found Overlap!")
            noOverlaps = False

    return noOverlaps

# Lambda Function Handler filename.handler -
# Creates AWS Config Rule connection and parses event object to find VPC CIDR's
def lambda_handler(event, context):

    logger.info(json.dumps(event))

    event_item = json.loads(event['invokingEvent'])
    rules_item = json.loads(event['ruleParameters'])
    config_item = event_item['configurationItem']
    resource_type = config_item['resourceType']

    logger.info(json.dumps(rules_item))

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
    cidr = config_item['configuration']['cidrBlock']
    onprem = rules_item['onPremNetworks'].split(',')
    result = cidrcheck(onprem, cidr)

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
