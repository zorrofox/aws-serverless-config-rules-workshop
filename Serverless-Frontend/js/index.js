function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
initializeStorage();
var refreshInterval;

var configString = localStorage.getItem("awsConfig");
var configObj = JSON.parse(configString);
if (configObj != null) {
  refreshDisplay();
}

$(document).on('click', '#logOutButton', function(event) {
  localStorage.clear();
  document.location.reload();
});

$("#loginForm").submit(function(event) {
  event.preventDefault();
  loginUser(refreshDisplay);
});

$(document).on('click', '#submitCreateTeamButton', function(event) {
  event.preventDefault();
  $('#createTeamModal').delay(500).fadeOut(450).modal('hide');
  var teamToCreate = document.getElementById("newTeamNameText").value;
  joinTeam(teamToCreate, refreshDisplay);
});

$(document).on('click', '#selectTeamButton', function(event) {
  event.preventDefault();
  $('#joinTeamModal').delay(500).fadeOut(450).modal('hide');
  var teamToJoin = $("#teamList").find("option:selected").text();
  joinTeam(teamToJoin, refreshDisplay);
});

$(document).on('click', "#copyJwtButton", function(event) {
  $("#jwtTokenText").select();
  document.execCommand('copy');
});

function initializeStorage() {
  var identityPoolId = _config.UserPoolId; //
  var userPoolId = _config.UserPoolId; //
  var clientId = _config.ClientId; //
  var loginPrefix = 'cognito-idp.' + _config.AwsRegion + '.amazonaws.com/' + _config.UserPoolId;

  localStorage.setItem('identityPoolId', identityPoolId);
  localStorage.setItem('userPoolId', userPoolId);
  localStorage.setItem('clientId', clientId);
  localStorage.setItem('loginPrefix', loginPrefix);
}

function loginUser(callback) {

  var userPoolId = localStorage.getItem('userPoolId');
  var clientId = localStorage.getItem('clientId');
  var identityPoolId = localStorage.getItem('identityPoolId');
  var loginPrefix = localStorage.getItem('loginPrefix');

  var poolData = {
    UserPoolId: userPoolId, // Your user pool id here
    ClientId: clientId // Your client id here
  };
  var userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);

  var email = document.getElementById('email').value;
  var pwd = document.getElementById('pwd').value;

  var authenticationData = {
    'UserName': email,
    'Password': pwd
  }
  var userData = {
    Username: email,
    Pool: userPool
  };

  var authenticationDetails = new AWSCognito.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);
  var cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);
  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: function(result) {
      console.log('access token + \n' + result.getAccessToken().getJwtToken());

      var sessionTokens = {
        IdToken: result.getIdToken(),
        AccessToken: result.getAccessToken(),
        RefreshToken: result.getRefreshToken()
      };

      localStorage.setItem('sessionTokens', JSON.stringify(sessionTokens));

      //POTENTIAL: Region needs to be set if not already set previously elsewhere.
      AWS.config.region = _config.AwsRegion;
      AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId, // your identity pool id here
        Logins: {
          // Change the key below according to the specific region your user pool is in.
          loginPrefix: sessionTokens.IdToken.jwtToken
        }
      });
      localStorage.setItem('awsConfig', JSON.stringify(AWS.config));
      localStorage.setItem('email', email);
      $("#loginModal").modal("hide");
      callback();
    },

    onFailure: function(err) {
      alert(err);
    },

  });
}

function getLeaderboard() {
  var leaderboardApi = _config.BaseEndpoint + "/teamscores";

  var idJwt = getIdJwt();

  $.ajax({
    url: leaderboardApi,
    async: false,
    type: 'GET',
    headers: {
      'Authorization': idJwt
    },
    success: function(response) {
      var scores = response.scores;
      $('#leaderboardTable').bootstrapTable({
        data: scores,
        url: 'notreal.json'
      });
      var $leaderboard = $('#leaderboardTable');
      $leaderboard.bootstrapTable('load', scores);

      $("#teamList").find("option").remove();

      for (team of scores) {
        $("#teamList").append('<option value="' + team.teamId + '">' + team.teamId + '</option>');
        $("#teamList").selectpicker('refresh');
      }
    },
    error: function(response) {
      
      if (response.status == "401") {
        console.log("could not retrieve leaderboard, refreshing tokens");
        refreshAWSCredentials();
        //getLeaderboard();
      }
    }
  });
}

function refreshDisplay() {
  retrieveUser();
  var userEmail = localStorage.getItem("email");
  var teamId = localStorage.getItem("teamId");
  var sessionTokensString = localStorage.getItem("sessionTokens");
  var sessionTokens = JSON.parse(sessionTokensString);
  var jwt = sessionTokens.IdToken.jwtToken;

  $("#logInButton").addClass("hidden");
  $("#logOutButton").removeClass("hidden");
  $("#emailText").text("Logged in as: " + userEmail);
  $("#emailText").removeClass("hidden");
  $("#createTeamButton").removeClass("hidden");
  $("#joinTeamButton").removeClass("hidden");

  jwtText = "Your JWT (enter this in StepFunctions when validating rules to score!): ";
  $("#jwtText").text(jwtText);
  $("#jwtText").removeClass("hidden");
  var copyJwtText = "{\"Jwt\": \"" + jwt + "\" }"
  $("#jwtTokenText").text(copyJwtText);
  $("#jwtTokenText").removeClass("hidden");
  $("#copyJwtButton").removeClass("hidden");

  var teamNameText = "";
  if (teamId == null) {
    teamNameText = "Team name: Please create or join a team!"

  } else {
    teamNameText = "Team name: " + teamId;
  }
  $("#teamText").text(teamNameText);
  $("#teamText").removeClass("hidden");

  getLeaderboard();
  if (refreshInterval != null) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(refreshDisplay, 30000);

}

function refreshAWSCredentials() {

  var userPoolId = localStorage.getItem('userPoolId');
  var clientId = localStorage.getItem('clientId');
  var identityPoolId = localStorage.getItem('identityPoolId');
  var loginPrefix = localStorage.getItem('loginPrefix');

  var poolData = {
    UserPoolId: userPoolId, // Your user pool id here
    ClientId: clientId // Your client id here
  };

  var userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
  var cognitoUser = userPool.getCurrentUser();

  if (cognitoUser != null) {
    cognitoUser.getSession(function(err, result) {
      if (result) {
        console.log('You are now logged in.');
        cognitoUser.refreshSession(result.getRefreshToken(), function(err, result) {

          if (err) { //throw err;
            console.log('In the err: ' + err);
          } else {
            localStorage.setItem('awsConfig', JSON.stringify(AWS.config));
            var sessionTokens = {
              IdToken: result.getIdToken(),
              AccessToken: result.getAccessToken(),
              RefreshToken: result.getRefreshToken()
            };
            localStorage.setItem("sessionTokens", JSON.stringify(sessionTokens));

            refreshDisplay();
          }
        });

      }
    });
  }


}

function retrieveUser() {
  var userApi = _config.BaseEndpoint + "/users";

  var idJwt = getIdJwt();

  $.ajax({
    url: userApi,
    async: false,
    type: 'GET',
    headers: {
      'Authorization': idJwt
    },
    success: function(response) {
      var teamId = response.teamId;
      localStorage.setItem("teamId", teamId);
    },
    error: function(response) {

      if (response.status == "401") {
        console.log("could not retrieve team list, refreshing tokens");
        refreshAWSCredentials();
        //retrieveUser();
      }
    }
  });
}

function retrieveTeamList() {
  var userApi = _config.BaseEndpoint + "/teams";

  var idJwt = getIdJwt();

  $.ajax({
    url: userApi,
    async: false,
    type: 'GET',
    headers: {
      'Authorization': idJwt
    },
    success: function(response) {
      var teamList = response;
      localStorage.setItem("teamList", JSON.stringify(teamList));
    },
    error: function(response) {
      
      if (response.status == "401") {
        console.log("could not retrieve team list, refreshing tokens");
        refreshAWSCredentials();
        //retreiveTeamList();
      }
    }
  });
}

function joinTeam(teamIdToJoin, callback) {
  var teamsApi = _config.BaseEndpoint + "/teams";

  var idJwt = getIdJwt();

  var postBody = {
    teamId: teamIdToJoin
  };
  console.log("Joining a team!");

  $.ajax({
    url: teamsApi,
    async: false,
    type: 'POST',
    data: JSON.stringify({
      teamId: teamIdToJoin
    }),
    headers: {
      'Authorization': idJwt
    },
    success: function(response) {
      var teamId = response.teamId;
      callback();
    },
    error: function(response) {
      
      if (response.status == "401") {
        console.log("could not create team, refreshing tokens");
        alert("could not create team, refreshing tokens");
        refreshAWSCredentials();
        //joinTeam(teamIdToJoin, callback);
      }
    }
  });
}

function getIdJwt(){
  var sessionTokensString = localStorage.getItem('sessionTokens');
  var sessionTokens = JSON.parse(sessionTokensString);
  var IdToken = sessionTokens.IdToken;
  return IdToken.jwtToken;
}