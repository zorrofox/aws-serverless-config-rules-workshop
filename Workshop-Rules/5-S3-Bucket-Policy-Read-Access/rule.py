import json
import boto3
import logging


APPLICABLE_RESOURCES = ["AWS::S3::Bucket"]
config = boto3.client("config")
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def evaluate_compliance(invoking_event, whitelisted_role):

    if invoking_event['configurationItem']['resourceType'] not in APPLICABLE_RESOURCES:
        return "NOT_APPLICABLE"

    if invoking_event['configurationItem']['configurationItemStatus'] == "ResourceDeleted":
        return "NOT_APPLICABLE"

    compliance_status = "COMPLIANT"


    if not invoking_event['configurationItemDiff']:
        return "NOT_APPLICABLE"

    configuration_diff = invoking_event['configurationItemDiff']
    account_id = invoking_event['configurationItem']['awsAccountId']
    policy_text = invoking_event['configurationItem']['supplementaryConfiguration']['BucketPolicy']['policyText']
    b = bytes(policy_text, encoding='ascii')
    policy = json.loads(b.decode('unicode-escape'))
    print("POLICY: " + json.dumps(policy))

    if 'Statement' in policy:
        for statement in policy['Statement']:
            print(json.dumps(statement))
            if 'Action' in statement and 'Principal' in statement:
                if 'Get' in statement['Action'] or '*' in statement['Action']:
                    if 'AWS' not in statement['Principal'] or statement['Principal']['AWS'] != "arn:aws:iam::" + account_id + ":role/" + whitelisted_role:
                        compliance_status = "NON_COMPLIANT"

    return compliance_status


def lambda_handler(event, context):

    logger.info("Event: " + json.dumps(event))

    invoking_event = json.loads(event["invokingEvent"])
    rule_parameters = json.loads(event["ruleParameters"])
    whitelisted_role = rule_parameters["whitelistedRole"]
    configuration_item = invoking_event['configurationItem']
    if not invoking_event['configurationItemDiff']:
        return "Nothing to check, policy didn't change."

    result_token = "No token found."
    if "resultToken" in event:
        result_token = event["resultToken"]


    compliance = evaluate_compliance(invoking_event, whitelisted_role)

    evaluation = {
        "ComplianceResourceType":
            configuration_item["resourceType"],
        "ComplianceResourceId":
            configuration_item["resourceId"],
        "ComplianceType": compliance,
        "Annotation":
            "SSH Access is allowed to not allowed IP addess range",
        "OrderingTimestamp":
            configuration_item["configurationItemCaptureTime"]
    }

    if "dryRun" not in event:
        config.put_evaluations(
            Evaluations=[evaluation],
            ResultToken=result_token
        )

    return evaluation['ComplianceType']
