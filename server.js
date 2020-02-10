const mc = require("mongodb").MongoClient; //connecting to the db for storing sessions

const mongoose = require("mongoose");
const express = require('express');
const Question = require("./QuestionModel");
const User = require("./UserModel");
const bodyParser = require('body-parser');
const session = require('express-session');

const MongoDBStore = require('connect-mongodb-session')(session); //storing sessions

const store = new MongoDBStore({ //storing sessions
  uri: 'mongodb://localhost:27017/tokens',
  collection: 'sessiondata'
});

const app = express();

app.use(session({ secret: 'some secret here', store: store })) 

app.set("view engine", "pug");
app.use(express.static("public"));
app.use(express.json());
app.use(bodyParser.urlencoded({extended:true})); //parsing 

function auth(req, res, next) {//auth middleware
	if(!req.session.loggedin){ 
		res.status(401).send("Unauthorized");
		return;
	}
	
	next();
};

app.get('/', function(req, res, next) { //homepage
	//this is used in a lot of methods basically it checks if the person is logged in and sends that to the pug with a status of 0 or 1 to change the headers
	let loggedin = req.session.loggedin; 
	let status;
	if(!loggedin){
		status = {loggedin: 0};
	}
	else{
		status = {loggedin: 1};
		status.tempid = req.session.tempid;
	}
	res.render("pages/index", {status: status});
	return;
});

app.get('/login', function(req,res,next){ //login link
	let loggedin = req.session.loggedin;
	let status;
	
	if(!loggedin){
		status = {loggedin: 0};
	}
	else{
		status = {loggedin: 1};
		status.tempid = req.session.tempid;
	}
	res.render("pages/login", {status: status});
	return;
});

app.post('/login', function(req,res,next){ //posting login
	
	if(req.session.loggedin){ //if they are already logged in
		res.status(200).send("Already logged in.");
		return;
	}
	
	User.findOne(req.body, function(err, person){//find the person in the database with username and password
		if (err) throw err; 
		if(!person){
			res.redirect('http://localhost:3000/');	
		}
		else{
			req.session.loggedin = true; //log them in
			req.session.username = person.username;
			req.session.tempid = person._id;
			res.redirect('http://localhost:3000/users/'+person._id); //redirect them
		}
	});
});

app.get('/logout', function(req,res,next){ //log out button / route
	if(req.session.loggedin){
		req.session.loggedin = false; //logs them out
		res.redirect('http://localhost:3000/'); //redirects them
	}else{
		res.status(200).send("You cannot log out because you aren't logged in."); //if they are not logged in
	}
});

app.get('/users',function(req,res,next){ //users button / route
	let loggedin = req.session.loggedin;
	let status;
	
	if(!loggedin){
		status = 0;
	}
	else{
		status = 1;
	}
	db.collection('users').find({"privacy": false}).toArray(function(err, result){ //finds all the users with privacy false
		if(err) throw err;
		result.loggedin = status;
		result.tempid = req.session.tempid;
		res.render("pages/users", {status: result}); //sends it to pug file
	});
});

app.get('/users/:userID', function(req,res,next){ //single user (profile) / route
	let loggedin = req.session.loggedin;
	let status;
	
	if(!loggedin){
		status = 0;
	}
	else{
		status = 1;
	}
	let id = req.params.userID; //getting id param
	
	User.findOne({_id: id}, function(err, person){
		if(err) throw err;
		if(!loggedin){ //checking a profile if they're not logged in
			if(person.privacy == true){
				res.status(403).send("Profile is private"); 
			}
			else{
				
				person.loggedin = status;
				res.render("pages/singleUserNotLogged", {status: person});
				
			}
		}
		else{
			//checking a profile if they are logged in
			if(person._id.equals(req.session.tempid)){
				person.loggedin = status;
				person.tempid = req.session.tempid;
				res.render("pages/singleUser", {status: person});
			}
			else{
				person.loggedin = status;
				person.tempid = req.session.tempid;
				res.render("pages/singleUserNotLogged", {status: person});
			}
		}
	});
	
	
});

app.post('/save', function(req,res,next){ //when you click save button

	let privacy;
	if(req.body.privacy == "true"){// sets privacy to whatever was selected
		privacy = true; 
	}
	else{
		privacy = false;
	}
	
	let updateDoc = {"$set": {privacy: privacy}}; //update query
	db.collection("users").updateOne({username: req.session.username}, updateDoc, function(err, result){ //update the privacy of the user
		if (err) throw (err);
		res.redirect('http://localhost:3000/users/'+req.session.tempid); //redirect them to their profile
	});
});


//Returns a page with a new quiz of 10 random questions
app.get("/quiz", function(req, res, next){
	let loggedin = req.session.loggedin;
	let status;
	
	if(!loggedin){
		status = 0;
	}
	else{
		
		status = 1;
	}
	
	Question.getRandomQuestions(function(err, results){
		if(err) throw err;
		results.loggedin = status;
		results.tempid = req.session.tempid;
		res.status(200).render("pages/quiz", {status: results});
		return;
	});
})

//The quiz page posts the results here
//Extracts the JSON containing quiz IDs/answers
//Calculates the correct answers and replies
app.post("/quiz", function(req, res, next){
	let loggedin = req.session.loggedin;
	let ids = [];
	try{
		//Try to build an array of ObjectIds
		for(id in req.body){
			ids.push(new mongoose.Types.ObjectId(id));
		}
		
		//Find all questions with Ids in the array
		Question.findIDArray(ids, function(err, results){
			if(err)throw err; //will be caught by catch below
			
			//Count up the correct answers
			let correct = 0;
			for(let i = 0; i < results.length; i++){
				if(req.body[results[i]._id] === results[i].correct_answer){
					correct++;
				}
			}
			
			//Send response
			
			if(!loggedin){
				res.json({url: "/", correct: correct}); //if they are not logged in send the result and redirect them 
			}
			else{ //if they are logged in find the user update their data and then redirect them
				db.collection("users").findOne({username: req.session.username}, function(err, result){
					if (err) throw err;
					let total_score = result.total_score + correct;
					let total_quizzes = result.total_quizzes + 1;
					console.log(total_quizzes);
					let updateDoc = {"$set": {total_score: total_score, total_quizzes: total_quizzes}};
					db.collection("users").updateOne({username: req.session.username}, updateDoc, function(err, result){
						if(err) throw err;
						console.log(req.session.tempid);
						res.json({url: "http://localhost:3000/users/"+req.session.tempid, correct:correct});
					});
					
				});
				
			}
			
			return;
		});
	}catch(err){
		//If any error is thrown (casting Ids or reading database), send 500 status
		console.log(err);
		res.status(500).send("Error processing quiz data.");
		return;
	}
	
});

//Connect to database
mongoose.connect('mongodb://localhost/quiztracker', {useNewUrlParser: true});
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
	app.listen(3000);
	console.log("Server listening on port 3000");
});